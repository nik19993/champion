begin;

alter table public.evaluation_metrics
  add column age_from smallint,
  add column age_to smallint;

alter table public.evaluation_metrics
  add constraint evaluation_metrics_age_band_check
  check (
    (
      kind = 'game_activity'
      and age_from is null
      and age_to is null
    )
    or (
      kind = 'physical_preparedness'
      and (
        (age_from is null and age_to is null)
        or (age_from = 6 and age_to = 12)
        or (age_from = 13 and age_to = 15)
      )
    )
  );

update public.evaluation_metrics
set age_from = 6,
    age_to = 12
where kind = 'physical_preparedness'
  and (
    lower(trim(name)) in ('фламінго', 'flamingo', 'flamingo balance test')
    or lower(name) like '%flamingo%'
  );

update public.evaluation_metrics
set is_active = false
where name like '[ТЕСТ]%';

drop index public.evaluation_metrics_kind_name_idx;

create unique index evaluation_metrics_kind_name_age_idx
  on public.evaluation_metrics (
    kind,
    lower(name),
    coalesce(age_from, 0),
    coalesce(age_to, 0)
  );

drop index public.evaluation_metrics_active_order_idx;

create index evaluation_metrics_active_order_idx
  on public.evaluation_metrics (kind, age_from, age_to, sort_order, name)
  where is_active;

insert into public.evaluation_metrics (
  kind,
  name,
  description,
  sort_order,
  is_active
)
select
  'game_activity',
  source.name,
  source.description,
  source.sort_order,
  true
from (
  values
    ('Лідерські якості', 'Оцінка від 1 до 5 балів.', 1),
    ('Психоемоційна підготовленість', 'Оцінка від 1 до 5 балів.', 2),
    ('Тактико-технічна підготовленість', 'Оцінка від 1 до 5 балів.', 3)
) as source(name, description, sort_order)
where not exists (
  select 1
  from public.evaluation_metrics metric
  where metric.kind = 'game_activity'
    and lower(metric.name) = lower(source.name)
    and metric.age_from is null
    and metric.age_to is null
);

create or replace function private.enforce_evaluation_metric_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_count integer;
begin
  if not new.is_active then
    return new;
  end if;

  if new.kind = 'physical_preparedness' then
    if new.age_from is null or new.age_to is null then
      raise exception 'EVALUATION_METRIC_AGE_REQUIRED'
        using errcode = '23514';
    end if;

    select count(*) into active_count
    from public.evaluation_metrics metric
    where metric.kind = new.kind
      and metric.age_from = new.age_from
      and metric.age_to = new.age_to
      and metric.is_active
      and metric.id is distinct from new.id;

    if active_count >= 4 then
      raise exception 'EVALUATION_METRIC_LIMIT:PHYSICAL:%-%', new.age_from, new.age_to
        using errcode = '23514';
    end if;
  else
    select count(*) into active_count
    from public.evaluation_metrics metric
    where metric.kind = 'game_activity'
      and metric.is_active
      and metric.id is distinct from new.id;

    if active_count >= 3 then
      raise exception 'EVALUATION_METRIC_LIMIT:GAME_ACTIVITY'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger evaluation_metrics_enforce_limit
before insert or update of kind, age_from, age_to, is_active
on public.evaluation_metrics
for each row execute function private.enforce_evaluation_metric_limit();

revoke all on function private.enforce_evaluation_metric_limit() from public;

create or replace function private.validate_evaluation_result_metric()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_kind public.evaluation_metric_kind;
  player_age smallint;
  selected_metric public.evaluation_metrics%rowtype;
begin
  expected_kind := case
    when tg_table_name = 'physical_test_results' then 'physical_preparedness'::public.evaluation_metric_kind
    else 'game_activity'::public.evaluation_metric_kind
  end;

  select target_group.age into player_age
  from public.players player
  join public.groups target_group on target_group.id = player.group_id
  where player.id = new.player_id;

  if new.metric_id is not null then
    select * into selected_metric
    from public.evaluation_metrics metric
    where metric.id = new.metric_id
      and metric.kind = expected_kind
      and metric.is_active
      and (
        expected_kind = 'game_activity'
        or metric.age_from is null
        or player_age between metric.age_from and metric.age_to
      );
  else
    select * into selected_metric
    from public.evaluation_metrics metric
    where metric.kind = expected_kind
      and metric.is_active
      and lower(metric.name) = lower(trim(new.metric_name))
      and (
        expected_kind = 'game_activity'
        or metric.age_from is null
        or player_age between metric.age_from and metric.age_to
      )
    order by
      case when metric.age_from is null then 1 else 0 end,
      metric.sort_order,
      metric.id
    limit 1;
  end if;

  if selected_metric.id is null then
    raise exception 'EVALUATION_METRIC_NOT_FOUND_FOR_PLAYER_AGE: %', coalesce(new.metric_name, new.metric_id::text, '—')
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

drop trigger physical_results_validate_metric on public.physical_test_results;
create trigger physical_results_validate_metric
before insert or update of player_id, metric_id, metric_name, unit
on public.physical_test_results
for each row execute function private.validate_evaluation_result_metric();

drop trigger game_activity_validate_metric on public.game_activity_results;
create trigger game_activity_validate_metric
before insert or update of player_id, metric_id, metric_name
on public.game_activity_results
for each row execute function private.validate_evaluation_result_metric();

commit;
