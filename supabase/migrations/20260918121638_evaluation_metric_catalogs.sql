begin;

create type public.evaluation_metric_kind as enum ('physical_preparedness', 'game_activity');

create table public.evaluation_metrics (
  id uuid primary key default gen_random_uuid(),
  kind public.evaluation_metric_kind not null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  default_unit text check (default_unit is null or char_length(trim(default_unit)) between 1 and 40),
  description text check (description is null or char_length(description) <= 1000),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index evaluation_metrics_kind_name_idx
  on public.evaluation_metrics (kind, lower(name));
create index evaluation_metrics_active_order_idx
  on public.evaluation_metrics (kind, sort_order, name)
  where is_active;
create index evaluation_metrics_created_by_idx on public.evaluation_metrics (created_by);
create index evaluation_metrics_updated_by_idx on public.evaluation_metrics (updated_by);

alter table public.physical_test_results
  add column metric_id uuid references public.evaluation_metrics(id);
alter table public.game_activity_results
  add column metric_id uuid references public.evaluation_metrics(id);

insert into public.evaluation_metrics (kind, name, default_unit, sort_order, is_active)
select 'physical_preparedness', source.metric_name, min(nullif(trim(source.unit), '')), (row_number() over (order by lower(source.metric_name)))::integer, true
from public.physical_test_results source
group by source.metric_name
on conflict do nothing;

insert into public.evaluation_metrics (kind, name, sort_order, is_active)
select 'game_activity', source.metric_name, (row_number() over (order by lower(source.metric_name)))::integer, true
from public.game_activity_results source
group by source.metric_name
on conflict do nothing;

update public.physical_test_results result
set metric_id = metric.id
from public.evaluation_metrics metric
where metric.kind = 'physical_preparedness'
  and lower(metric.name) = lower(result.metric_name);

update public.game_activity_results result
set metric_id = metric.id
from public.evaluation_metrics metric
where metric.kind = 'game_activity'
  and lower(metric.name) = lower(result.metric_name);

create or replace function private.validate_evaluation_result_metric()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_kind public.evaluation_metric_kind;
  selected_metric public.evaluation_metrics%rowtype;
begin
  expected_kind := case
    when tg_table_name = 'physical_test_results' then 'physical_preparedness'::public.evaluation_metric_kind
    else 'game_activity'::public.evaluation_metric_kind
  end;

  if new.metric_id is not null then
    select * into selected_metric
    from public.evaluation_metrics metric
    where metric.id = new.metric_id
      and metric.kind = expected_kind
      and metric.is_active;
  else
    select * into selected_metric
    from public.evaluation_metrics metric
    where metric.kind = expected_kind
      and metric.is_active
      and lower(metric.name) = lower(trim(new.metric_name));
  end if;

  if selected_metric.id is null then
    raise exception 'EVALUATION_METRIC_NOT_FOUND: %', coalesce(new.metric_name, new.metric_id::text, '—')
      using errcode = '23503';
  end if;

  new.metric_id := selected_metric.id;
  new.metric_name := selected_metric.name;
  if expected_kind = 'physical_preparedness' then
    new.unit := coalesce(nullif(trim(new.unit), ''), selected_metric.default_unit);
  end if;
  return new;
end;
$$;

create trigger physical_results_validate_metric
before insert or update of metric_id, metric_name, unit on public.physical_test_results
for each row execute function private.validate_evaluation_result_metric();

create trigger game_activity_validate_metric
before insert or update of metric_id, metric_name on public.game_activity_results
for each row execute function private.validate_evaluation_result_metric();

alter table public.physical_test_results alter column metric_id set not null;
alter table public.game_activity_results alter column metric_id set not null;

create index physical_test_results_metric_id_idx on public.physical_test_results (metric_id);
create index game_activity_results_metric_id_idx on public.game_activity_results (metric_id);

create trigger evaluation_metrics_set_updated_at
before update on public.evaluation_metrics
for each row execute function private.set_updated_at();

create trigger evaluation_metrics_audit
after insert or update or delete on public.evaluation_metrics
for each row execute function private.audit_change();

alter table public.evaluation_metrics enable row level security;

create policy evaluation_metrics_staff_read on public.evaluation_metrics
for select to authenticated
using ((select private.is_admin()) or ((select private.is_active_user()) and is_active));

create policy evaluation_metrics_admin_all on public.evaluation_metrics
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

revoke all on public.evaluation_metrics from anon, authenticated;
grant select, insert, update, delete on public.evaluation_metrics to authenticated;

create or replace function public.confirm_import_job(p_job_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  job public.import_jobs%rowtype;
  item record;
  target_group_id uuid;
  target_player_id uuid;
  player_matches integer;
  preview_count integer;
  imported integer := 0;
  phase_value public.methodology_phase;
  level_value public.methodology_level;
begin
  if not (select private.is_admin()) then raise exception 'Administrator MFA required' using errcode = '42501'; end if;
  select * into job from public.import_jobs where id = p_job_id and created_by = (select auth.uid()) for update;
  if job.id is null or job.status <> 'previewed' then raise exception 'Import job is not ready' using errcode = '22023'; end if;
  select count(*) into preview_count from public.import_rows where import_job_id = p_job_id;
  if preview_count = 0 or preview_count <> job.total_rows then raise exception 'Import preview is incomplete' using errcode = '22023'; end if;
  if exists (select 1 from public.import_rows where import_job_id = p_job_id and (not is_valid or cardinality(errors) > 0)) then
    raise exception 'Import contains invalid rows' using errcode = '22023';
  end if;

  for item in select * from public.import_rows where import_job_id = p_job_id order by row_number loop
    if job.dataset = 'players' then
      select id into target_group_id from public.groups where upper(code) = upper(item.payload ->> 'group') and is_active;
      if target_group_id is null then raise exception 'Unknown group in row %', item.row_number using errcode = '22023'; end if;
      if exists (select 1 from public.players where group_id = target_group_id and lower(full_name) = lower(item.payload ->> 'full_name') and is_active) then
        raise exception 'Duplicate player in row %', item.row_number using errcode = '23505';
      end if;
      insert into public.players(group_id, full_name, birth_year, position, is_active, created_by)
      values (target_group_id, item.payload ->> 'full_name', (item.payload ->> 'birth_year')::smallint, nullif(item.payload ->> 'position', ''), true, (select auth.uid()));
    elsif job.dataset in ('physical_tests', 'game_activity') then
      select count(*) into player_matches
      from public.players where lower(full_name) = lower(item.payload ->> 'player') and is_active;
      if player_matches <> 1 then raise exception 'Player must be unique in row %', item.row_number using errcode = '22023'; end if;
      select id into target_player_id from public.players where lower(full_name) = lower(item.payload ->> 'player') and is_active limit 1;
      if job.dataset = 'physical_tests' then
        if exists (select 1 from public.physical_test_results where player_id = target_player_id and measured_on = (item.payload ->> 'date')::date and lower(metric_name) = lower(item.payload ->> 'metric')) then
          raise exception 'Duplicate physical test in row %', item.row_number using errcode = '23505';
        end if;
        insert into public.physical_test_results(player_id, measured_on, metric_name, value, unit, source, created_by)
        values (target_player_id, (item.payload ->> 'date')::date, item.payload ->> 'metric', item.payload ->> 'value', nullif(item.payload ->> 'unit', ''), 'import', (select auth.uid()));
      else
        if exists (select 1 from public.game_activity_results where player_id = target_player_id and period = item.payload ->> 'period' and lower(metric_name) = lower(item.payload ->> 'metric')) then
          raise exception 'Duplicate game activity result in row %', item.row_number using errcode = '23505';
        end if;
        insert into public.game_activity_results(player_id, period, metric_name, value, source, created_by)
        values (target_player_id, item.payload ->> 'period', item.payload ->> 'metric', item.payload ->> 'value', 'import', (select auth.uid()));
      end if;
    elsif job.dataset = 'tasks' then
      phase_value := case when lower(item.payload ->> 'phase') in ('defence', 'захист') or lower(item.payload ->> 'phase') like '%зах%' then 'defence'::public.methodology_phase else 'attack'::public.methodology_phase end;
      level_value := case when lower(item.payload ->> 'level') in ('team', 'командна') or lower(item.payload ->> 'level') like '%команд%' then 'team'::public.methodology_level when lower(item.payload ->> 'level') in ('group', 'групова') or lower(item.payload ->> 'level') like '%груп%' then 'group'::public.methodology_level else 'individual'::public.methodology_level end;
      if exists (select 1 from public.methodology_tasks where phase = phase_value and level = level_value and lower(title) = lower(item.payload ->> 'title') and age_from = (item.payload ->> 'age_from')::smallint and age_to = (item.payload ->> 'age_to')::smallint and is_active) then
        raise exception 'Duplicate methodology task in row %', item.row_number using errcode = '23505';
      end if;
      insert into public.methodology_tasks(phase, level, component, title, description, age_from, age_to, sort_order, is_active, created_by)
      values (phase_value, level_value, nullif(item.payload ->> 'component', ''), item.payload ->> 'title', nullif(item.payload ->> 'description', ''), (item.payload ->> 'age_from')::smallint, (item.payload ->> 'age_to')::smallint, item.row_number, true, (select auth.uid()));
    elsif job.dataset = 'terminology' then
      insert into public.terminology_entries(term, definition, category, source, is_active, created_by, updated_by)
      values (item.payload ->> 'term', item.payload ->> 'definition', item.payload ->> 'category', nullif(item.payload ->> 'source', ''), true, (select auth.uid()), (select auth.uid()))
      on conflict (term, category) do update set definition = excluded.definition, source = excluded.source, is_active = true, updated_by = (select auth.uid());
    else
      raise exception 'Unsupported import dataset' using errcode = '22023';
    end if;
    imported := imported + 1;
  end loop;

  update public.import_jobs
  set status = 'completed', confirmed_by = (select auth.uid()), confirmed_at = now(), updated_at = now()
  where id = p_job_id;
  return imported;
end;
$$;

revoke all on function private.validate_evaluation_result_metric() from public;

commit;
