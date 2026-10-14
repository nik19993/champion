-- Approved training bookkeeping workflow. UNAPPLIED: requires the verified DB
-- backup and a coordinated frontend rollout. Does not update event bookings.
begin;

create table public.training_register_completions (
  event_id uuid primary key references public.events(id) on delete cascade,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  attendance_version integer not null check (attendance_version >= 0),
  present_count integer not null check (present_count >= 0),
  player_count integer not null check (player_count >= present_count),
  card_count integer not null check (card_count >= 0),
  updated_at timestamptz not null default now()
);
create index training_register_completed_by_idx on public.training_register_completions(completed_by);
alter table public.training_register_completions enable row level security;
create policy training_register_group_read on public.training_register_completions
  for select to authenticated using (
    (select private.is_admin()) or (select private.event_in_my_group(event_id))
  );
revoke all on public.training_register_completions from public, anon, authenticated;
grant select on public.training_register_completions to authenticated;

-- Existing attendance/card write permissions are unchanged. Only this narrowly
-- scoped RPC can write the completion marker; callers cannot forge it directly.
create function private.complete_training_register(
  p_event_id uuid, p_expected_attendance_version integer, p_expected_card_ids uuid[], p_expected_records jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.events%rowtype;
  session public.attendance_sessions%rowtype;
  actual_card_ids uuid[];
  expected_card_ids uuid[];
  actual_records jsonb;
  expected_records jsonb;
  total integer;
  present integer;
  result public.training_register_completions%rowtype;
begin
  if (select auth.uid()) is null or not (select private.is_active_user()) then
    raise exception 'REGISTER_ACCESS_DENIED' using errcode = '42501';
  end if;
  select * into target from public.events where id = p_event_id for update;
  if target.id is null or target.status = 'cancelled' then
    raise exception 'REGISTER_EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (select private.is_admin()) and not (
    (select private.has_group(target.group_id)) and exists (
      select 1 from public.profiles p where p.id = (select auth.uid())
        and p.role = 'coach' and p.status = 'active'
    )
  ) then
    raise exception 'REGISTER_ACCESS_DENIED' using errcode = '42501';
  end if;
  if target.event_type <> 'training' then
    raise exception 'REGISTER_TRAINING_ONLY' using errcode = '23514';
  end if;
  -- Deliberately no start/end/date cutoff: bookkeeping can happen before,
  -- during, at the end of, or after training, including later dates.
  select * into session from public.attendance_sessions where event_id = target.id for update;
  if session.id is null or session.completed_at is null then
    raise exception 'REGISTER_ATTENDANCE_REQUIRED' using errcode = '23514';
  end if;
  if p_expected_attendance_version is null or p_expected_attendance_version <> session.server_version
    or p_expected_card_ids is null then
    raise exception 'REGISTER_CHANGED' using errcode = '40001';
  end if;
  select coalesce(array_agg(c.id order by c.id), '{}'::uuid[]) into actual_card_ids
    from public.player_behavior_cards c where c.event_id = target.id and not c.is_voided;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into expected_card_ids
    from unnest(p_expected_card_ids) as supplied(id);
  if actual_card_ids <> expected_card_ids then
    raise exception 'REGISTER_CHANGED' using errcode = '40001';
  end if;
  if p_expected_records is null or jsonb_typeof(p_expected_records) <> 'array' then
    raise exception 'REGISTER_CHANGED' using errcode = '40001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('player_id',r.player_id,'status',r.status,'note',r.note) order by r.player_id), '[]'::jsonb)
    into actual_records from public.attendance_records r where r.session_id = session.id;
  select coalesce(jsonb_agg(jsonb_build_object('player_id',r.player_id,'status',r.status,'note',r.note) order by r.player_id), '[]'::jsonb)
    into expected_records from jsonb_to_recordset(p_expected_records) as r(player_id uuid, status text, note text);
  if actual_records <> expected_records then
    raise exception 'REGISTER_CHANGED' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.players p where p.group_id = target.group_id and p.is_active
      and not exists (select 1 from public.attendance_records r
        where r.session_id = session.id and r.player_id = p.id)
  ) then
    raise exception 'REGISTER_ATTENDANCE_INCOMPLETE' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.player_behavior_cards c where c.event_id = target.id and not c.is_voided
      and not exists (select 1 from public.attendance_records r
        where r.session_id = session.id and r.player_id = c.player_id and r.status = 'present')
  ) then
    raise exception 'REGISTER_CARD_ATTENDANCE_MISMATCH' using errcode = '23514';
  end if;
  select count(*), count(*) filter (where status = 'present') into total, present
    from public.attendance_records where session_id = session.id;
  insert into public.training_register_completions
    (event_id, completed_at, completed_by, attendance_version, present_count, player_count, card_count)
  values (target.id, now(), (select auth.uid()), session.server_version, present, total, cardinality(actual_card_ids))
  on conflict (event_id) do update set completed_at = excluded.completed_at,
    completed_by = excluded.completed_by, attendance_version = excluded.attendance_version,
    present_count = excluded.present_count, player_count = excluded.player_count,
    card_count = excluded.card_count, updated_at = now()
  where training_register_completions.completed_at is null
    or training_register_completions.attendance_version <> excluded.attendance_version;
  select * into result from public.training_register_completions where event_id = target.id;
  return to_jsonb(result);
end;
$$;
revoke all on function private.complete_training_register(uuid, integer, uuid[], jsonb) from public, anon;
grant execute on function private.complete_training_register(uuid, integer, uuid[], jsonb) to authenticated;
create function public.complete_training_register(
  p_event_id uuid, p_expected_attendance_version integer, p_expected_card_ids uuid[], p_expected_records jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select private.complete_training_register(p_event_id, p_expected_attendance_version, p_expected_card_ids, p_expected_records);
$$;
revoke all on function public.complete_training_register(uuid, integer, uuid[], jsonb) from public, anon;
grant execute on function public.complete_training_register(uuid, integer, uuid[], jsonb) to authenticated;

-- A real write invalidates confirmation; merely opening a screen does not.
-- Event locking serializes this with completion without changing event.status.
create function private.invalidate_training_register()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_event uuid;
  new_event uuid;
  target_event uuid;
begin
  if tg_table_name = 'attendance_records' then
    if tg_op <> 'INSERT' then select event_id into old_event from public.attendance_sessions where id = old.session_id; end if;
    if tg_op <> 'DELETE' then select event_id into new_event from public.attendance_sessions where id = new.session_id; end if;
  else
    if tg_op <> 'INSERT' then old_event := old.event_id; end if;
    if tg_op <> 'DELETE' then new_event := new.event_id; end if;
  end if;
  for target_event in select distinct value from unnest(array[old_event, new_event]) as affected(value)
    where value is not null order by value loop
    perform id from public.events where id = target_event for update;
    update public.training_register_completions set completed_at = null, updated_at = now()
      where event_id = target_event and completed_at is not null;
  end loop;
  return null;
end;
$$;
revoke all on function private.invalidate_training_register() from public, anon, authenticated;
create trigger attendance_register_session_changed
  after update of server_version, completed_at, event_id or delete on public.attendance_sessions
  for each row execute function private.invalidate_training_register();
create trigger attendance_register_records_changed
  after insert or update or delete on public.attendance_records
  for each row execute function private.invalidate_training_register();
create trigger attendance_register_cards_changed
  after insert or delete or update of is_voided, player_id, event_id, occurred_on, reason, comment
  on public.player_behavior_cards for each row execute function private.invalidate_training_register();

-- Existing verified RPC, with historical training participants preserved.
create or replace function public.save_attendance(
  p_event_id uuid,
  p_idempotency_key uuid,
  p_client_created_at timestamptz,
  p_records jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target_group_id uuid;
  target_status text;
  expected_count integer;
  provided_count integer;
  distinct_count integer;
  target_session_id uuid;
  effective_client_at timestamptz := least(coalesce(p_client_created_at, now()), now());
begin
  if not (select private.is_active_user()) then
    raise exception 'Active user required' using errcode = '42501';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Attendance records must be an array' using errcode = '22023';
  end if;
  select group_id, status::text into target_group_id, target_status
  from public.events where id = p_event_id for update;
  if target_group_id is null or target_status = 'cancelled' then
    raise exception 'Active event not found' using errcode = 'P0002';
  end if;
  if not (select private.is_admin()) and not (select private.has_group(target_group_id)) then
    raise exception 'Attendance permission denied' using errcode = '42501';
  end if;

  select count(*) into expected_count
  from public.players where group_id = target_group_id and is_active;
  provided_count := jsonb_array_length(p_records);
  select count(distinct (entry ->> 'player_id')::uuid) into distinct_count
  from jsonb_array_elements(p_records) as entries(entry);
  if provided_count <> expected_count or distinct_count <> expected_count then
    raise exception 'Attendance must contain every active player exactly once' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_records) as entries(entry)
    left join public.players p on p.id = (entry ->> 'player_id')::uuid
    where p.id is null or p.group_id <> target_group_id or not p.is_active
      or (entry ->> 'status') not in ('present', 'absent')
  ) then
    raise exception 'Invalid attendance record' using errcode = '22023';
  end if;

  insert into public.attendance_sessions(event_id, completed_at, completed_by, idempotency_key, client_created_at)
  values (p_event_id, now(), (select auth.uid()), p_idempotency_key, effective_client_at)
  on conflict (event_id) do update
  set completed_at = excluded.completed_at, completed_by = excluded.completed_by,
      idempotency_key = excluded.idempotency_key, client_created_at = excluded.client_created_at,
      server_version = attendance_sessions.server_version + 1, updated_at = now()
  where attendance_sessions.client_created_at <= excluded.client_created_at
  returning id into target_session_id;

  if target_session_id is null then
    select id into target_session_id from public.attendance_sessions where event_id = p_event_id;
    return target_session_id;
  end if;

  -- Keep recorded archived/transferred participants when revising training.
  -- Current active participants are still supplied and validated exactly once.
  delete from public.attendance_records record_row where session_id = target_session_id
    and (not exists (select 1 from public.events e where e.id = p_event_id and e.event_type = 'training')
      or exists (select 1 from public.players p where p.id = record_row.player_id
        and p.group_id = target_group_id and p.is_active));
  insert into public.attendance_records(session_id, player_id, status, note, actor_id)
  select target_session_id, (entry ->> 'player_id')::uuid,
         (entry ->> 'status')::public.attendance_status,
         nullif(left(trim(entry ->> 'note'), 500), ''), (select auth.uid())
  from jsonb_array_elements(p_records) as entries(entry);
  return target_session_id;
end;
$$;

-- No historical session is automatically marked as completed. No old migration
-- ledger entry, Auth URL, event status, field booking or attendance is rewritten.
notify pgrst, 'reload schema';
commit;
