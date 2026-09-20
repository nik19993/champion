begin;

create table public.evaluation_metric_fields (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references public.evaluation_metrics(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 120),
  unit text check (unit is null or char_length(trim(unit)) between 1 and 40),
  description text check (description is null or char_length(description) <= 500),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index evaluation_metric_fields_metric_label_idx
  on public.evaluation_metric_fields (metric_id, lower(label));
create index evaluation_metric_fields_active_order_idx
  on public.evaluation_metric_fields (metric_id, sort_order, label)
  where is_active;
create index evaluation_metric_fields_created_by_idx
  on public.evaluation_metric_fields (created_by);
create index evaluation_metric_fields_updated_by_idx
  on public.evaluation_metric_fields (updated_by);

create table public.physical_test_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  measured_on date not null,
  started_at time,
  temperature_c numeric(4, 1) check (temperature_c is null or temperature_c between -50 and 60),
  weather text check (weather is null or char_length(trim(weather)) between 1 and 120),
  wind text check (wind is null or char_length(trim(wind)) between 1 and 120),
  venue_name text check (venue_name is null or char_length(trim(venue_name)) between 1 and 200),
  surface text check (surface is null or char_length(trim(surface)) between 1 and 120),
  footwear text check (footwear is null or char_length(trim(footwear)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  source text,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index physical_test_sessions_group_date_idx
  on public.physical_test_sessions (group_id, measured_on desc, started_at);
create index physical_test_sessions_import_job_idx
  on public.physical_test_sessions (import_job_id)
  where import_job_id is not null;
create index physical_test_sessions_created_by_idx
  on public.physical_test_sessions (created_by);
create index physical_test_sessions_updated_by_idx
  on public.physical_test_sessions (updated_by);

create or replace function private.validate_evaluation_metric_field()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_kind public.evaluation_metric_kind;
begin
  select metric.kind into parent_kind
  from public.evaluation_metrics metric
  where metric.id = new.metric_id;

  if parent_kind is distinct from 'physical_preparedness'::public.evaluation_metric_kind then
    raise exception 'EVALUATION_FIELD_REQUIRES_PHYSICAL_TEST'
      using errcode = '23514';
  end if;

  new.label := trim(new.label);
  new.unit := nullif(trim(coalesce(new.unit, '')), '');
  new.description := nullif(trim(coalesce(new.description, '')), '');
  return new;
end;
$$;

create trigger evaluation_metric_fields_validate
before insert or update of metric_id, label, unit, description
on public.evaluation_metric_fields
for each row execute function private.validate_evaluation_metric_field();

create trigger evaluation_metric_fields_set_updated_at
before update on public.evaluation_metric_fields
for each row execute function private.set_updated_at();

create trigger evaluation_metric_fields_audit
after insert or update or delete on public.evaluation_metric_fields
for each row execute function private.audit_change();

create trigger physical_test_sessions_set_updated_at
before update on public.physical_test_sessions
for each row execute function private.set_updated_at();

create trigger physical_test_sessions_audit
after insert or update or delete on public.physical_test_sessions
for each row execute function private.audit_change();

revoke all on function private.validate_evaluation_metric_field() from public;

-- Canonical four-test battery for U6-U12.
update public.evaluation_metrics
set name = 'Фламінго',
    default_unit = 'разів',
    description = 'Фіксується кількість втрат рівноваги.',
    sort_order = 1,
    is_active = true
where kind = 'physical_preparedness'
  and age_from = 6
  and age_to = 12
  and lower(trim(name)) = 'фламінго';

insert into public.evaluation_metrics (
  kind, age_from, age_to, name, default_unit, description, sort_order, is_active
)
select 'physical_preparedness', source.age_from, source.age_to, source.name,
       source.default_unit, source.description, source.sort_order, true
from (
  values
    (6::smallint, 12::smallint, 'Фламінго', 'разів', 'Фіксується кількість втрат рівноваги.', 1),
    (6::smallint, 12::smallint, 'Стрибок у довжину', 'см', 'Фіксується лише краща спроба.', 2),
    (6::smallint, 12::smallint, 'Біг 20 м', 'с', 'Фіксується час подолання 20 метрів.', 3),
    (6::smallint, 12::smallint, 'Тест 505', null, 'Окремо фіксується оббігання справа і зліва.', 4),
    (13::smallint, 15::smallint, 'Стрибок у довжину', 'см', 'Фіксується лише краща спроба.', 1),
    (13::smallint, 15::smallint, 'Біг', null, 'Окремо фіксується час на 40 м і 20 м.', 2),
    (13::smallint, 15::smallint, 'Тест 505', null, 'Окремо фіксується оббігання справа і зліва.', 3),
    (13::smallint, 15::smallint, 'Yo-Yo IR1', 'м', 'Фіксується подолана дистанція у метрах.', 4)
) as source(age_from, age_to, name, default_unit, description, sort_order)
where not exists (
  select 1
  from public.evaluation_metrics metric
  where metric.kind = 'physical_preparedness'
    and metric.age_from = source.age_from
    and metric.age_to = source.age_to
    and lower(metric.name) = lower(source.name)
);

update public.evaluation_metrics metric
set default_unit = source.default_unit,
    description = source.description,
    sort_order = source.sort_order,
    is_active = true
from (
  values
    (6::smallint, 12::smallint, 'Фламінго', 'разів', 'Фіксується кількість втрат рівноваги.', 1),
    (6::smallint, 12::smallint, 'Стрибок у довжину', 'см', 'Фіксується лише краща спроба.', 2),
    (6::smallint, 12::smallint, 'Біг 20 м', 'с', 'Фіксується час подолання 20 метрів.', 3),
    (6::smallint, 12::smallint, 'Тест 505', null, 'Окремо фіксується оббігання справа і зліва.', 4),
    (13::smallint, 15::smallint, 'Стрибок у довжину', 'см', 'Фіксується лише краща спроба.', 1),
    (13::smallint, 15::smallint, 'Біг', null, 'Окремо фіксується час на 40 м і 20 м.', 2),
    (13::smallint, 15::smallint, 'Тест 505', null, 'Окремо фіксується оббігання справа і зліва.', 3),
    (13::smallint, 15::smallint, 'Yo-Yo IR1', 'м', 'Фіксується подолана дистанція у метрах.', 4)
) as source(age_from, age_to, name, default_unit, description, sort_order)
where metric.kind = 'physical_preparedness'
  and metric.age_from = source.age_from
  and metric.age_to = source.age_to
  and lower(metric.name) = lower(source.name);

insert into public.evaluation_metric_fields (
  metric_id, label, unit, description, sort_order, is_active
)
select metric.id, source.field_label, source.unit, source.field_description,
       source.field_sort_order, true
from (
  values
    (6::smallint, 12::smallint, 'Фламінго', 'К-сть втрат рівноваги', 'разів', 'Кількість зафіксованих втрат рівноваги.', 1),
    (6::smallint, 12::smallint, 'Стрибок у довжину', 'Краща спроба', 'см', 'Найкращий результат із виконаних спроб.', 1),
    (6::smallint, 12::smallint, 'Біг 20 м', '20 м', 'с', 'Час подолання дистанції 20 м.', 1),
    (6::smallint, 12::smallint, 'Тест 505', 'Оббігання справа', 'с', 'Час виконання з оббіганням справа.', 1),
    (6::smallint, 12::smallint, 'Тест 505', 'Оббігання зліва', 'с', 'Час виконання з оббіганням зліва.', 2),
    (13::smallint, 15::smallint, 'Стрибок у довжину', 'Краща спроба', 'см', 'Найкращий результат із виконаних спроб.', 1),
    (13::smallint, 15::smallint, 'Біг', '40 м', 'с', 'Час подолання дистанції 40 м.', 1),
    (13::smallint, 15::smallint, 'Біг', '20 м', 'с', 'Час подолання дистанції 20 м.', 2),
    (13::smallint, 15::smallint, 'Тест 505', 'Оббігання справа', 'с', 'Час виконання з оббіганням справа.', 1),
    (13::smallint, 15::smallint, 'Тест 505', 'Оббігання зліва', 'с', 'Час виконання з оббіганням зліва.', 2),
    (13::smallint, 15::smallint, 'Yo-Yo IR1', 'Дистанція', 'м', 'Загальна подолана дистанція.', 1)
) as source(age_from, age_to, metric_name, field_label, unit, field_description, field_sort_order)
join public.evaluation_metrics metric
  on metric.kind = 'physical_preparedness'
 and metric.age_from = source.age_from
 and metric.age_to = source.age_to
 and lower(metric.name) = lower(source.metric_name)
where not exists (
  select 1
  from public.evaluation_metric_fields field
  where field.metric_id = metric.id
    and lower(field.label) = lower(source.field_label)
);

-- Every legacy physical metric keeps a usable single result field.
insert into public.evaluation_metric_fields (
  metric_id, label, unit, description, sort_order, is_active
)
select metric.id, 'Результат', metric.default_unit,
       'Поле результату, створене для сумісності з раніше внесеними даними.', 1, true
from public.evaluation_metrics metric
where metric.kind = 'physical_preparedness'
  and not exists (
    select 1 from public.evaluation_metric_fields field where field.metric_id = metric.id
  );

alter table public.physical_test_results
  add column field_id uuid references public.evaluation_metric_fields(id),
  add column field_name text,
  add column session_id uuid references public.physical_test_sessions(id) on delete set null;

update public.physical_test_results result
set field_id = (
      select field.id
      from public.evaluation_metric_fields field
      where field.metric_id = result.metric_id
      order by field.is_active desc, field.sort_order, field.id
      limit 1
    ),
    field_name = (
      select field.label
      from public.evaluation_metric_fields field
      where field.metric_id = result.metric_id
      order by field.is_active desc, field.sort_order, field.id
      limit 1
    );

alter table public.physical_test_results
  alter column field_id set not null,
  alter column field_name set not null;

create index physical_test_results_field_id_idx
  on public.physical_test_results (field_id);
create index physical_test_results_session_id_idx
  on public.physical_test_results (session_id)
  where session_id is not null;
create unique index physical_test_results_player_date_metric_field_idx
  on public.physical_test_results (player_id, measured_on, metric_id, field_id);

drop trigger physical_results_validate_metric on public.physical_test_results;
drop trigger game_activity_validate_metric on public.game_activity_results;

create or replace function private.validate_physical_test_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_age smallint;
  player_group_id uuid;
  selected_metric public.evaluation_metrics%rowtype;
  selected_field public.evaluation_metric_fields%rowtype;
  selected_session public.physical_test_sessions%rowtype;
begin
  select target_group.age, target_group.id
  into player_age, player_group_id
  from public.players player
  join public.groups target_group on target_group.id = player.group_id
  where player.id = new.player_id;

  if player_age is null then
    select case
      when player.birth_date is not null
        then extract(year from age(new.measured_on, player.birth_date))::smallint
      when player.birth_year is not null
        then extract(year from new.measured_on)::smallint - player.birth_year
      else null
    end
    into player_age
    from public.players player
    where player.id = new.player_id;
  end if;

  -- Goalkeeper sheets use the young battery for ages 9–12 and the older
  -- battery for ages 13–17. The catalog keeps the agreed U13–U15 label,
  -- so ages 16–17 are normalized to that older battery.
  if player_age between 13 and 17 then
    player_age := 15;
  end if;

  if player_age is null or player_age not between 6 and 15 then
    raise exception 'PLAYER_AGE_REQUIRED_FOR_PHYSICAL_TEST'
      using errcode = '23514';
  end if;

  if new.metric_id is not null then
    select * into selected_metric
    from public.evaluation_metrics metric
    where metric.id = new.metric_id
      and metric.kind = 'physical_preparedness'
      and metric.is_active
      and (metric.age_from is null or player_age between metric.age_from and metric.age_to);
  else
    select * into selected_metric
    from public.evaluation_metrics metric
    where metric.kind = 'physical_preparedness'
      and metric.is_active
      and lower(metric.name) = lower(trim(new.metric_name))
      and (metric.age_from is null or player_age between metric.age_from and metric.age_to)
    order by case when metric.age_from is null then 1 else 0 end, metric.sort_order, metric.id
    limit 1;
  end if;

  if selected_metric.id is null then
    raise exception 'EVALUATION_METRIC_NOT_FOUND_FOR_PLAYER_AGE: %',
      coalesce(new.metric_name, new.metric_id::text, '—')
      using errcode = '23503';
  end if;

  if new.field_id is not null then
    select * into selected_field
    from public.evaluation_metric_fields field
    where field.id = new.field_id
      and field.metric_id = selected_metric.id
      and field.is_active;
  elsif nullif(trim(coalesce(new.field_name, '')), '') is not null then
    select * into selected_field
    from public.evaluation_metric_fields field
    where field.metric_id = selected_metric.id
      and field.is_active
      and lower(field.label) = lower(trim(new.field_name));
  elsif (
    select count(*) from public.evaluation_metric_fields field
    where field.metric_id = selected_metric.id and field.is_active
  ) = 1 then
    select * into selected_field
    from public.evaluation_metric_fields field
    where field.metric_id = selected_metric.id and field.is_active
    limit 1;
  end if;

  if selected_field.id is null then
    raise exception 'EVALUATION_FIELD_NOT_FOUND: % / %',
      selected_metric.name, coalesce(new.field_name, new.field_id::text, '—')
      using errcode = '23503';
  end if;

  if new.session_id is not null then
    select * into selected_session
    from public.physical_test_sessions session
    where session.id = new.session_id;
    if selected_session.id is null
       or selected_session.group_id <> player_group_id
       or selected_session.measured_on <> new.measured_on then
      raise exception 'PHYSICAL_TEST_SESSION_MISMATCH'
        using errcode = '23514';
    end if;
  end if;

  new.metric_id := selected_metric.id;
  new.metric_name := selected_metric.name;
  new.field_id := selected_field.id;
  new.field_name := selected_field.label;
  new.unit := selected_field.unit;
  return new;
end;
$$;

create or replace function private.validate_game_activity_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_metric public.evaluation_metrics%rowtype;
begin
  if new.metric_id is not null then
    select * into selected_metric
    from public.evaluation_metrics metric
    where metric.id = new.metric_id
      and metric.kind = 'game_activity'
      and metric.is_active;
  else
    select * into selected_metric
    from public.evaluation_metrics metric
    where metric.kind = 'game_activity'
      and metric.is_active
      and lower(metric.name) = lower(trim(new.metric_name))
    order by metric.sort_order, metric.id
    limit 1;
  end if;

  if selected_metric.id is null then
    raise exception 'EVALUATION_METRIC_NOT_FOUND: %',
      coalesce(new.metric_name, new.metric_id::text, '—')
      using errcode = '23503';
  end if;

  new.metric_id := selected_metric.id;
  new.metric_name := selected_metric.name;
  return new;
end;
$$;

create trigger physical_results_validate_metric
before insert or update of player_id, measured_on, metric_id, metric_name,
  field_id, field_name, unit, session_id
on public.physical_test_results
for each row execute function private.validate_physical_test_result();

create trigger game_activity_validate_metric
before insert or update of player_id, metric_id, metric_name
on public.game_activity_results
for each row execute function private.validate_game_activity_result();

drop function private.validate_evaluation_result_metric();
revoke all on function private.validate_physical_test_result() from public;
revoke all on function private.validate_game_activity_result() from public;

create or replace function public.save_physical_evaluation_metric(
  p_metric_id uuid,
  p_age_from smallint,
  p_age_to smallint,
  p_name text,
  p_description text,
  p_fields jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_metric_id uuid;
  field_item jsonb;
  target_field_id uuid;
  supplied_field_id uuid;
  saved_field_ids uuid[] := '{}'::uuid[];
  field_label text;
  field_unit text;
  field_description text;
  field_position integer := 0;
  active_field_count integer;
begin
  if not (select private.is_admin()) then
    raise exception 'Administrator MFA required' using errcode = '42501';
  end if;

  if (p_age_from, p_age_to) not in ((6::smallint, 12::smallint), (13::smallint, 15::smallint)) then
    raise exception 'EVALUATION_METRIC_AGE_REQUIRED' using errcode = '23514';
  end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 160 then
    raise exception 'EVALUATION_METRIC_NAME_INVALID' using errcode = '23514';
  end if;
  if jsonb_typeof(p_fields) is distinct from 'array'
     or jsonb_array_length(p_fields) not between 1 and 8 then
    raise exception 'EVALUATION_FIELDS_REQUIRED' using errcode = '23514';
  end if;

  if p_metric_id is null then
    insert into public.evaluation_metrics (
      kind, age_from, age_to, name, description, sort_order,
      is_active, created_by, updated_by
    )
    values (
      'physical_preparedness', p_age_from, p_age_to, trim(p_name),
      nullif(trim(coalesce(p_description, '')), ''),
      coalesce((
        select max(metric.sort_order) + 1
        from public.evaluation_metrics metric
        where metric.kind = 'physical_preparedness'
          and metric.age_from = p_age_from
          and metric.age_to = p_age_to
      ), 1),
      true, (select auth.uid()), (select auth.uid())
    )
    returning id into target_metric_id;
  else
    update public.evaluation_metrics metric
    set age_from = p_age_from,
        age_to = p_age_to,
        name = trim(p_name),
        description = nullif(trim(coalesce(p_description, '')), ''),
        updated_by = (select auth.uid())
    where metric.id = p_metric_id
      and metric.kind = 'physical_preparedness'
    returning metric.id into target_metric_id;
    if target_metric_id is null then
      raise exception 'EVALUATION_METRIC_NOT_FOUND' using errcode = '23503';
    end if;
  end if;

  for field_item in select value from jsonb_array_elements(p_fields) loop
    field_position := field_position + 1;
    field_label := trim(coalesce(field_item ->> 'label', ''));
    field_unit := nullif(trim(coalesce(field_item ->> 'unit', '')), '');
    field_description := nullif(trim(coalesce(field_item ->> 'description', '')), '');
    supplied_field_id := null;
    if nullif(field_item ->> 'id', '') is not null then
      supplied_field_id := (field_item ->> 'id')::uuid;
    end if;
    if char_length(field_label) not between 1 and 120 then
      raise exception 'EVALUATION_FIELD_LABEL_INVALID' using errcode = '23514';
    end if;

    target_field_id := null;
    if supplied_field_id is not null then
      update public.evaluation_metric_fields field
      set label = field_label,
          unit = field_unit,
          description = field_description,
          sort_order = field_position,
          is_active = true,
          updated_by = (select auth.uid())
      where field.id = supplied_field_id
        and field.metric_id = target_metric_id
      returning field.id into target_field_id;
      if target_field_id is null then
        raise exception 'EVALUATION_FIELD_NOT_FOUND' using errcode = '23503';
      end if;
    else
      select field.id into target_field_id
      from public.evaluation_metric_fields field
      where field.metric_id = target_metric_id
        and lower(field.label) = lower(field_label)
      limit 1;
      if target_field_id is null then
        insert into public.evaluation_metric_fields (
          metric_id, label, unit, description, sort_order, is_active,
          created_by, updated_by
        )
        values (
          target_metric_id, field_label, field_unit, field_description,
          field_position, true, (select auth.uid()), (select auth.uid())
        )
        returning id into target_field_id;
      else
        update public.evaluation_metric_fields field
        set unit = field_unit,
            description = field_description,
            sort_order = field_position,
            is_active = true,
            updated_by = (select auth.uid())
        where field.id = target_field_id;
      end if;
    end if;
    saved_field_ids := array_append(saved_field_ids, target_field_id);
  end loop;

  if cardinality(saved_field_ids) <> (
    select count(distinct field_id)
    from unnest(saved_field_ids) as ids(field_id)
  ) then
    raise exception 'EVALUATION_FIELD_DUPLICATE' using errcode = '23505';
  end if;

  update public.evaluation_metric_fields field
  set is_active = false,
      updated_by = (select auth.uid())
  where field.metric_id = target_metric_id
    and field.is_active
    and not (field.id = any(saved_field_ids));

  select count(*) into active_field_count
  from public.evaluation_metric_fields field
  where field.metric_id = target_metric_id and field.is_active;
  if active_field_count < 1 then
    raise exception 'EVALUATION_FIELDS_REQUIRED' using errcode = '23514';
  end if;

  update public.evaluation_metrics metric
  set default_unit = case
        when active_field_count = 1 then (
          select field.unit
          from public.evaluation_metric_fields field
          where field.metric_id = target_metric_id and field.is_active
          limit 1
        )
        else null
      end,
      updated_by = (select auth.uid())
  where metric.id = target_metric_id;

  return target_metric_id;
end;
$$;

revoke all on function public.save_physical_evaluation_metric(
  uuid, smallint, smallint, text, text, jsonb
) from public;
grant execute on function public.save_physical_evaluation_metric(
  uuid, smallint, smallint, text, text, jsonb
) to authenticated;

create or replace function public.confirm_import_job(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.import_jobs%rowtype;
  item record;
  target_group_id uuid;
  target_player_id uuid;
  target_session_id uuid;
  player_matches integer;
  preview_count integer;
  imported integer := 0;
  phase_value public.methodology_phase;
  level_value public.methodology_level;
  measured_date date;
  session_time time;
  session_temperature numeric(4, 1);
begin
  if not (select private.is_admin()) then
    raise exception 'Administrator MFA required' using errcode = '42501';
  end if;
  select * into job
  from public.import_jobs
  where id = p_job_id and created_by = (select auth.uid())
  for update;
  if job.id is null or job.status <> 'previewed' then
    raise exception 'Import job is not ready' using errcode = '22023';
  end if;
  select count(*) into preview_count
  from public.import_rows where import_job_id = p_job_id;
  if preview_count = 0 or preview_count <> job.total_rows then
    raise exception 'Import preview is incomplete' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.import_rows
    where import_job_id = p_job_id and (not is_valid or cardinality(errors) > 0)
  ) then
    raise exception 'Import contains invalid rows' using errcode = '22023';
  end if;

  for item in
    select * from public.import_rows
    where import_job_id = p_job_id
    order by row_number
  loop
    if job.dataset = 'players' then
      select id into target_group_id
      from public.groups
      where upper(code) = upper(item.payload ->> 'group') and is_active;
      if target_group_id is null then
        raise exception 'Unknown group in row %', item.row_number using errcode = '22023';
      end if;
      if exists (
        select 1 from public.players
        where group_id = target_group_id
          and lower(full_name) = lower(item.payload ->> 'full_name')
          and is_active
      ) then
        raise exception 'Duplicate player in row %', item.row_number using errcode = '23505';
      end if;
      insert into public.players (
        group_id, full_name, birth_year, position, is_active, created_by
      )
      values (
        target_group_id,
        item.payload ->> 'full_name',
        (item.payload ->> 'birth_year')::smallint,
        nullif(item.payload ->> 'position', ''),
        true,
        (select auth.uid())
      );
    elsif job.dataset in ('physical_tests', 'game_activity') then
      select id into target_group_id
      from public.groups
      where upper(code) = upper(item.payload ->> 'group') and is_active;
      if target_group_id is null then
        raise exception 'Unknown group in row %', item.row_number using errcode = '22023';
      end if;

      select count(*) into player_matches
      from public.players
      where group_id = target_group_id
        and lower(full_name) = lower(item.payload ->> 'player')
        and is_active;
      if player_matches <> 1 then
        raise exception 'Player must be unique in row %', item.row_number using errcode = '22023';
      end if;
      select id into target_player_id
      from public.players
      where group_id = target_group_id
        and lower(full_name) = lower(item.payload ->> 'player')
        and is_active
      limit 1;

      if job.dataset = 'physical_tests' then
        measured_date := (item.payload ->> 'date')::date;
        session_time := nullif(item.payload ->> 'time', '')::time;
        session_temperature := replace(nullif(item.payload ->> 'temperature_c', ''), ',', '.')::numeric;

        select session.id into target_session_id
        from public.physical_test_sessions session
        where session.import_job_id = p_job_id
          and session.group_id = target_group_id
          and session.measured_on = measured_date
          and session.started_at is not distinct from session_time
        order by session.created_at
        limit 1;

        if target_session_id is null then
          insert into public.physical_test_sessions (
            group_id, measured_on, started_at, temperature_c, weather, wind,
            venue_name, surface, footwear, notes, source, import_job_id,
            created_by, updated_by
          )
          values (
            target_group_id,
            measured_date,
            session_time,
            session_temperature,
            nullif(item.payload ->> 'weather', ''),
            nullif(item.payload ->> 'wind', ''),
            nullif(item.payload ->> 'venue', ''),
            nullif(item.payload ->> 'surface', ''),
            nullif(item.payload ->> 'footwear', ''),
            nullif(item.payload ->> 'session_notes', ''),
            'import',
            p_job_id,
            (select auth.uid()),
            (select auth.uid())
          )
          returning id into target_session_id;
        end if;

        if exists (
          select 1
          from public.physical_test_results
          where player_id = target_player_id
            and measured_on = measured_date
            and lower(metric_name) = lower(item.payload ->> 'metric')
            and lower(field_name) = lower(item.payload ->> 'field')
        ) then
          raise exception 'Duplicate physical test field in row %', item.row_number
            using errcode = '23505';
        end if;

        insert into public.physical_test_results (
          player_id, measured_on, metric_name, field_name, value, unit,
          session_id, source, created_by
        )
        values (
          target_player_id,
          measured_date,
          item.payload ->> 'metric',
          item.payload ->> 'field',
          item.payload ->> 'value',
          nullif(item.payload ->> 'unit', ''),
          target_session_id,
          'import',
          (select auth.uid())
        );
      else
        if exists (
          select 1 from public.game_activity_results
          where player_id = target_player_id
            and period = item.payload ->> 'period'
            and lower(metric_name) = lower(item.payload ->> 'metric')
        ) then
          raise exception 'Duplicate game activity result in row %', item.row_number
            using errcode = '23505';
        end if;
        insert into public.game_activity_results (
          player_id, period, metric_name, value, source, created_by
        )
        values (
          target_player_id,
          item.payload ->> 'period',
          item.payload ->> 'metric',
          item.payload ->> 'value',
          'import',
          (select auth.uid())
        );
      end if;
    elsif job.dataset = 'tasks' then
      phase_value := case
        when lower(item.payload ->> 'phase') in ('defence', 'захист')
          or lower(item.payload ->> 'phase') like '%зах%'
        then 'defence'::public.methodology_phase
        else 'attack'::public.methodology_phase
      end;
      level_value := case
        when lower(item.payload ->> 'level') in ('team', 'командна')
          or lower(item.payload ->> 'level') like '%команд%'
        then 'team'::public.methodology_level
        when lower(item.payload ->> 'level') in ('group', 'групова')
          or lower(item.payload ->> 'level') like '%груп%'
        then 'group'::public.methodology_level
        else 'individual'::public.methodology_level
      end;
      if exists (
        select 1 from public.methodology_tasks
        where phase = phase_value
          and level = level_value
          and lower(title) = lower(item.payload ->> 'title')
          and age_from = (item.payload ->> 'age_from')::smallint
          and age_to = (item.payload ->> 'age_to')::smallint
          and is_active
      ) then
        raise exception 'Duplicate methodology task in row %', item.row_number
          using errcode = '23505';
      end if;
      insert into public.methodology_tasks (
        phase, level, component, title, description, age_from, age_to,
        sort_order, is_active, created_by
      )
      values (
        phase_value,
        level_value,
        nullif(item.payload ->> 'component', ''),
        item.payload ->> 'title',
        nullif(item.payload ->> 'description', ''),
        (item.payload ->> 'age_from')::smallint,
        (item.payload ->> 'age_to')::smallint,
        item.row_number,
        true,
        (select auth.uid())
      );
    elsif job.dataset = 'terminology' then
      insert into public.terminology_entries (
        term, definition, category, source, is_active, created_by, updated_by
      )
      values (
        item.payload ->> 'term',
        item.payload ->> 'definition',
        item.payload ->> 'category',
        nullif(item.payload ->> 'source', ''),
        true,
        (select auth.uid()),
        (select auth.uid())
      )
      on conflict (term, category) do update
      set definition = excluded.definition,
          source = excluded.source,
          is_active = true,
          updated_by = (select auth.uid());
    else
      raise exception 'Unsupported import dataset' using errcode = '22023';
    end if;
    imported := imported + 1;
  end loop;

  update public.import_jobs
  set status = 'completed',
      confirmed_by = (select auth.uid()),
      confirmed_at = now(),
      updated_at = now()
  where id = p_job_id;
  return imported;
end;
$$;

alter table public.evaluation_metric_fields enable row level security;
alter table public.physical_test_sessions enable row level security;

create policy evaluation_metric_fields_staff_read
on public.evaluation_metric_fields
for select to authenticated
using (
  (select private.is_admin())
  or (
    (select private.is_active_user())
    and is_active
    and exists (
      select 1 from public.evaluation_metrics metric
      where metric.id = metric_id and metric.is_active
    )
  )
);

create policy evaluation_metric_fields_admin_all
on public.evaluation_metric_fields
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy physical_test_sessions_read_group
on public.physical_test_sessions
for select to authenticated
using ((select private.is_admin()) or (select private.has_group(group_id)));

create policy physical_test_sessions_admin_all
on public.physical_test_sessions
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

revoke all on public.evaluation_metric_fields from anon, authenticated;
grant select, insert, update, delete on public.evaluation_metric_fields to authenticated;

revoke all on public.physical_test_sessions from anon, authenticated;
grant select, insert, update, delete on public.physical_test_sessions to authenticated;

commit;
