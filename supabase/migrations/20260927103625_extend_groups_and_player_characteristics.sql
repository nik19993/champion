begin;

-- U16 and U17 are regular age groups and must follow the same A/B structure
-- as the existing older age categories.
alter table public.groups
  drop constraint if exists groups_shape_v2;

alter table public.groups
  add constraint groups_shape_v3 check (
    (
      group_kind = 'age'
      and age between 6 and 17
      and (
        (age in (6, 7) and team_suffix is null and code = 'U' || age::text)
        or
        (age between 8 and 17 and team_suffix in ('A', 'B') and code = 'U' || age::text || team_suffix)
      )
    )
    or
    (
      group_kind = 'goalkeeper'
      and age is null
      and team_suffix in ('A', 'B', 'C')
      and code = 'Воротарі ' || team_suffix
    )
  );

insert into public.groups (code, age, team_suffix, group_kind, is_active)
values
  ('U16A', 16, 'A', 'age', true),
  ('U16B', 16, 'B', 'age', true),
  ('U17A', 17, 'A', 'age', true),
  ('U17B', 17, 'B', 'age', true)
on conflict (code) do update
set age = excluded.age,
    team_suffix = excluded.team_suffix,
    group_kind = excluded.group_kind,
    is_active = true,
    updated_at = now();

-- Extend every age-aware module to the same supported range.
alter table public.methodology_tasks
  drop constraint if exists methodology_tasks_age_from_check,
  drop constraint if exists methodology_tasks_check;
alter table public.training_structures
  drop constraint if exists training_structures_age_from_check,
  drop constraint if exists training_structures_check;
alter table public.methodology_materials
  drop constraint if exists methodology_materials_age_from_check,
  drop constraint if exists methodology_materials_check;
alter table public.file_assets
  drop constraint if exists file_assets_context_age_check;
alter table public.announcement_targets
  drop constraint if exists announcement_targets_age_check;

alter table public.methodology_tasks
  add constraint methodology_tasks_age_from_v2_check check (age_from between 6 and 17),
  add constraint methodology_tasks_age_range_v2_check check (age_to between 6 and 17 and age_to >= age_from);
alter table public.training_structures
  add constraint training_structures_age_from_v2_check check (age_from between 6 and 17),
  add constraint training_structures_age_range_v2_check check (age_to between 6 and 17 and age_to >= age_from);
alter table public.methodology_materials
  add constraint methodology_materials_age_from_v2_check check (age_from between 6 and 17),
  add constraint methodology_materials_age_range_v2_check check (age_to between 6 and 17 and age_to >= age_from);
alter table public.file_assets
  add constraint file_assets_context_age_v2_check check (context_age between 6 and 17);
alter table public.announcement_targets
  add constraint announcement_targets_age_v2_check check (age between 6 and 17);

-- Until the administrator adds age-specific U16/U17 methodology, the current
-- senior U15 programme remains the shared senior baseline for U15-U17.
update public.methodology_tasks
set age_to = 17,
    updated_at = now()
where age_from = 15 and age_to = 15;

update public.methodology_materials
set age_to = 17
where age_from = 15 and age_to = 15;

update public.training_structures
set name = case
      when name = 'Структура заняття U9–U15' then 'Структура заняття U9–U17'
      else name
    end,
    age_to = 17,
    updated_at = now()
where age_from = 9 and age_to = 15;

-- The older physical-testing battery now explicitly covers U13-U17.
alter table public.evaluation_metrics
  drop constraint if exists evaluation_metrics_age_band_check;

update public.evaluation_metrics
set age_to = 17,
    updated_at = now()
where kind = 'physical_preparedness'
  and age_from = 13
  and age_to = 15;

alter table public.evaluation_metrics
  add constraint evaluation_metrics_age_band_v2_check
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
        or (age_from = 13 and age_to = 17)
      )
    )
  );

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

  if player_age is null or player_age not between 6 and 17 then
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

revoke all on function private.validate_physical_test_result() from public;

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

  if p_age_from is null
     or p_age_to is null
     or (p_age_from, p_age_to) not in ((6::smallint, 12::smallint), (13::smallint, 17::smallint)) then
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

-- Reuse the existing optional coach_note field, while adding the required
-- author and update metadata and a narrowly scoped write function for coaches.
alter table public.players
  add column coach_note_author_id uuid references public.profiles(id) on delete set null,
  add column coach_note_author_name text,
  add column coach_note_updated_at timestamptz,
  add constraint players_coach_note_length_check
    check (coach_note is null or char_length(coach_note) <= 2000),
  add constraint players_coach_note_author_name_check
    check (coach_note_author_name is null or char_length(trim(coach_note_author_name)) between 2 and 160);

update public.players player
set coach_note = nullif(trim(player.coach_note), ''),
    coach_note_author_id = coalesce(player.updated_by, player.created_by),
    coach_note_author_name = actor.full_name,
    coach_note_updated_at = player.updated_at
from public.profiles actor
where nullif(trim(player.coach_note), '') is not null
  and actor.id = coalesce(player.updated_by, player.created_by);

create index players_coach_note_author_idx
  on public.players (coach_note_author_id)
  where coach_note_author_id is not null;

comment on column public.players.coach_note is
  'Optional short text characteristic written by an assigned coach. No score or generated assessment.';
comment on column public.players.coach_note_author_id is
  'Profile that last changed the short coach characteristic.';
comment on column public.players.coach_note_updated_at is
  'Timestamp of the latest coach characteristic change, including clearing the field.';

create or replace function public.save_player_coach_note(
  p_player_id uuid,
  p_note text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
  actor_name text;
  prepared_note text;
  saved_at timestamptz := now();
begin
  select player.group_id into target_group_id
  from public.players player
  where player.id = p_player_id
    and player.is_active;

  select profile.full_name into actor_name
  from public.profiles profile
  where profile.id = (select auth.uid())
    and profile.role = 'coach'
    and profile.status = 'active';

  if target_group_id is null
     or actor_name is null
     or not (select private.has_group(target_group_id)) then
    raise exception 'PLAYER_COACH_NOTE_PERMISSION_DENIED'
      using errcode = '42501';
  end if;

  prepared_note := nullif(trim(coalesce(p_note, '')), '');
  if prepared_note is not null and char_length(prepared_note) > 2000 then
    raise exception 'PLAYER_COACH_NOTE_TOO_LONG'
      using errcode = '22001';
  end if;

  update public.players
  set coach_note = prepared_note,
      coach_note_author_id = (select auth.uid()),
      coach_note_author_name = actor_name,
      coach_note_updated_at = saved_at,
      updated_by = (select auth.uid())
  where id = p_player_id;

  return saved_at;
end;
$$;

revoke all on function public.save_player_coach_note(uuid, text) from public;
grant execute on function public.save_player_coach_note(uuid, text) to authenticated;

commit;
