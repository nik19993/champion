begin;

-- Historical records keep pointing to a stable profile after the Auth identity is removed.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists deletion_reason text,
  add constraint profiles_deleted_by_fkey
    foreign key (deleted_by) references public.profiles(id) on delete set null,
  add constraint profiles_deletion_reason_length
    check (deletion_reason is null or char_length(deletion_reason) <= 500);

create index if not exists profiles_deleted_by_idx
  on public.profiles (deleted_by)
  where deleted_by is not null;

comment on column public.profiles.deleted_at is
  'When the login identity was permanently removed; the profile remains for historical attribution.';

create or replace function public.finalize_coach_deletion(
  p_coach_id uuid,
  p_admin_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_role public.app_role;
  target_status public.profile_status;
  assignment_count integer := 0;
  future_event_count integer := 0;
  group_codes jsonb := '[]'::jsonb;
  kyiv_today date := (timezone('Europe/Kyiv', now()))::date;
begin
  if p_coach_id is null or p_admin_id is null or p_coach_id = p_admin_id then
    raise exception 'INVALID_DELETE_TARGET' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles administrator
    where administrator.id = p_admin_id
      and administrator.role = 'admin'
      and administrator.status = 'active'
  ) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select profile.role, profile.status
  into target_role, target_status
  from public.profiles profile
  where profile.id = p_coach_id
  for update;

  if target_role is null then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target_role <> 'coach' then
    raise exception 'ONLY_COACH_CAN_BE_DELETED' using errcode = '22023';
  end if;
  if target_status = 'closed' then
    raise exception 'USER_ALREADY_DELETED' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(item.code order by item.code), '[]'::jsonb)
  into group_codes
  from (
    select distinct group_row.code
    from public.coach_group_assignments assignment
    join public.groups group_row on group_row.id = assignment.group_id
    where assignment.coach_id = p_coach_id
      and assignment.is_active
  ) item;

  update public.coach_group_assignments assignment
  set is_active = false,
      valid_to = case
        when assignment.valid_from > kyiv_today then assignment.valid_from
        else kyiv_today
      end,
      updated_at = now()
  where assignment.coach_id = p_coach_id
    and assignment.is_active;
  get diagnostics assignment_count = row_count;

  insert into public.operational_items (
    group_id,
    event_id,
    item_type,
    status,
    title,
    comment,
    due_at,
    assigned_to,
    dedupe_key,
    created_by,
    updated_by
  )
  select
    event_row.group_id,
    event_row.id,
    'coach_substitution'::public.operational_type,
    'todo'::public.operational_status,
    'Потрібна заміна тренера',
    'Обліковий запис попереднього тренера видалено. Подію збережено для перепризначення.',
    event_row.start_at,
    null,
    event_row.id::text || ':coach_substitution',
    p_admin_id,
    p_admin_id
  from public.events event_row
  where event_row.coach_id = p_coach_id
    and event_row.start_at >= now()
    and event_row.status = 'scheduled'
  on conflict (dedupe_key) do update
  set status = 'todo'::public.operational_status,
      title = excluded.title,
      comment = excluded.comment,
      due_at = excluded.due_at,
      assigned_to = null,
      updated_by = p_admin_id,
      updated_at = now();

  update public.events event_row
  set needs_substitute = true,
      substitute_coach_id = null,
      updated_by = p_admin_id,
      updated_at = now()
  where event_row.coach_id = p_coach_id
    and event_row.start_at >= now()
    and event_row.status = 'scheduled';
  get diagnostics future_event_count = row_count;

  update public.profiles
  set status = 'closed',
      email = null,
      must_change_password = false,
      deleted_at = now(),
      deleted_by = p_admin_id,
      deletion_reason = nullif(btrim(p_reason), '')
  where id = p_coach_id;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    p_admin_id,
    'delete_coach',
    'profiles',
    p_coach_id,
    jsonb_build_object(
      'historical_profile_retained', true,
      'ended_assignment_count', assignment_count,
      'future_event_count', future_event_count,
      'group_codes', group_codes
    )
  );

  return jsonb_build_object(
    'ended_assignment_count', assignment_count,
    'future_event_count', future_event_count,
    'group_codes', group_codes
  );
end;
$$;

revoke all on function public.finalize_coach_deletion(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_coach_deletion(uuid, uuid, text) to service_role;

commit;
