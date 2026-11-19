-- A group has two equivalent assignment slots. The legacy role remains for
-- compatibility with existing exports; access depends on the active assignment.
set local lock_timeout = '5s';

alter table public.coach_group_assignments
  add column coach_slot smallint not null default 1,
  add constraint coach_assignment_slot_range check (coach_slot in (1, 2));

-- Preserve existing assignments, including any older assistant assignments.
-- The slot constraint aborts the migration if a group already exceeds the limit.
with numbered as (
  select id, row_number() over (
    partition by group_id order by (assignment_role = 'lead') desc, valid_from, id
  )::smallint as slot
  from public.coach_group_assignments
  where is_active
)
update public.coach_group_assignments a
set coach_slot = numbered.slot
from numbered
where a.id = numbered.id and numbered.slot <> 1;

create unique index coach_group_active_slot_idx
  on public.coach_group_assignments (group_id, coach_slot)
  where is_active;

drop index public.one_active_lead_per_group_idx;

-- Callers must hold the coach and group locks before invoking this helper.
create function private.write_coach_group_assignment(
  p_coach_id uuid, p_group_id uuid, p_assigned boolean, p_today date
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  free_slot smallint;
begin
  if not p_assigned then
    update public.coach_group_assignments
    set is_active = false, valid_to = greatest(valid_from, p_today), updated_at = now()
    where coach_id = p_coach_id and group_id = p_group_id and is_active;
    return;
  end if;

  if exists (
    select 1 from public.coach_group_assignments
    where coach_id = p_coach_id and group_id = p_group_id and is_active
  ) then
    return;
  end if;

  select slot into free_slot
  from (values (1::smallint), (2::smallint)) as slots(slot)
  where not exists (
    select 1 from public.coach_group_assignments a
    where a.group_id = p_group_id and a.is_active and a.coach_slot = slots.slot
  )
  order by slot
  limit 1;

  if free_slot is null then
    raise exception 'COACH_GROUP_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into public.coach_group_assignments (
    coach_id, group_id, coach_slot, assignment_role, is_active, valid_from, valid_to, created_by
  )
  values (p_coach_id, p_group_id, free_slot, 'lead', true, p_today, null, (select auth.uid()))
  on conflict (coach_id, group_id) do update
  set coach_slot = excluded.coach_slot, assignment_role = 'lead', is_active = true,
      valid_from = excluded.valid_from, valid_to = null, updated_at = now();
end;
$function$;

revoke all on function private.write_coach_group_assignment(uuid, uuid, boolean, date)
  from public, anon, authenticated, service_role;

create function private.admin_set_coach_group(p_coach_id uuid, p_group_id uuid, p_assigned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not (select private.is_admin()) then
    raise exception 'Administrator MFA required' using errcode = '42501';
  end if;
  if p_assigned is null then
    raise exception 'INVALID_INPUT' using errcode = '22004';
  end if;

  perform 1 from public.profiles
  where id = p_coach_id and role = 'coach' and (not p_assigned or status = 'active')
  for no key update;
  if not found then
    raise exception 'COACH_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  perform 1 from public.groups
  where id = p_group_id and (not p_assigned or is_active)
  for no key update;
  if not found then
    raise exception 'GROUP_NOT_AVAILABLE' using errcode = 'P0002';
  end if;

  perform private.write_coach_group_assignment(
    p_coach_id, p_group_id, p_assigned, (now() at time zone 'Europe/Kyiv')::date
  );
end;
$function$;

revoke all on function private.admin_set_coach_group(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function private.admin_set_coach_group(uuid, uuid, boolean) to authenticated;

create function public.admin_set_coach_group(p_coach_id uuid, p_group_id uuid, p_assigned boolean)
returns void
language sql
security invoker
set search_path = ''
as $function$
  select private.admin_set_coach_group(p_coach_id, p_group_id, p_assigned);
$function$;

revoke all on function public.admin_set_coach_group(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_set_coach_group(uuid, uuid, boolean) to authenticated;

-- Keep the existing API working for user creation and older clients. A batch
-- replaces only the selected coach's groups, with no changes to other coaches.
create or replace function public.admin_assign_groups(p_coach_id uuid, p_group_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_group_id uuid;
  desired_groups uuid[] := coalesce(p_group_ids, '{}'::uuid[]);
  today date := (now() at time zone 'Europe/Kyiv')::date;
begin
  if not (select private.is_admin()) then
    raise exception 'Administrator MFA required' using errcode = '42501';
  end if;

  perform 1 from public.profiles
  where id = p_coach_id and role = 'coach' and status = 'active'
  for no key update;
  if not found then
    raise exception 'Active coach not found' using errcode = 'P0002';
  end if;

  -- Lock the affected groups in a consistent order, also used for inserts.
  perform 1 from public.groups g
  where g.id = any(desired_groups) or exists (
    select 1 from public.coach_group_assignments a
    where a.coach_id = p_coach_id and a.group_id = g.id and a.is_active
  )
  order by g.id
  for no key update;

  if exists (
    select 1 from unnest(desired_groups) as target(group_id)
    where not exists (select 1 from public.groups g where g.id = target.group_id and g.is_active)
  ) then
    raise exception 'Active group not found' using errcode = 'P0002';
  end if;

  for target_group_id in
    select a.group_id from public.coach_group_assignments a
    where a.coach_id = p_coach_id and a.is_active and not (a.group_id = any(desired_groups))
  loop
    perform private.write_coach_group_assignment(p_coach_id, target_group_id, false, today);
  end loop;

  for target_group_id in select distinct unnest(desired_groups)
  loop
    perform private.write_coach_group_assignment(p_coach_id, target_group_id, true, today);
  end loop;
end;
$function$;
