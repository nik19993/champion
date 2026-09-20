create or replace function public.attach_event_task_material(p_event_id uuid, p_task_id uuid, p_file_asset_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_group_id uuid;
  target_age integer;
  target_task_id uuid;
  asset public.file_assets%rowtype;
begin
  select e.group_id, g.age, e.task_id
  into target_group_id, target_age, target_task_id
  from public.events e
  join public.groups g on g.id = e.group_id
  where e.id = p_event_id;

  if target_group_id is null or target_task_id is distinct from p_task_id or not (select private.has_group(target_group_id)) then
    raise exception 'Event task material permission denied' using errcode = '42501';
  end if;

  select * into asset from public.file_assets where id = p_file_asset_id for update;
  if asset.id is null
    or asset.owner_id <> (select auth.uid())
    or asset.bucket <> 'task-documents'
    or asset.scan_status <> 'clean'
    or asset.context_group_id is distinct from target_group_id
    or asset.context_age is distinct from target_age then
    raise exception 'File is not a validated material for this event' using errcode = '42501';
  end if;

  insert into public.event_materials(event_id, file_asset_id, source_type, actor_id)
  values (p_event_id, p_file_asset_id, 'coach', (select auth.uid()))
  on conflict (event_id, file_asset_id) do nothing;

  insert into public.methodology_materials(task_id, age_from, age_to, file_asset_id, added_by)
  values (p_task_id, target_age, target_age, p_file_asset_id, (select auth.uid()))
  on conflict (task_id, file_asset_id) do nothing;
end;
$$;

create or replace function public.save_uniform_request(
  p_player_id uuid,
  p_number smallint,
  p_surname_print text,
  p_items jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target_group_id uuid;
  target_request_id uuid;
  current_status public.uniform_status;
  item jsonb;
  catalog_id uuid;
  selected_size text;
  catalog_sizes text[];
begin
  if not (select private.is_active_user()) then
    raise exception 'Active user required' using errcode = '42501';
  end if;
  select group_id into target_group_id from public.players where id = p_player_id and is_active;
  if target_group_id is null or (not (select private.is_admin()) and not (select private.has_group(target_group_id))) then
    raise exception 'Player permission denied' using errcode = '42501';
  end if;
  if p_number is not null and (p_number < 0 or p_number > 99) then
    raise exception 'Invalid uniform number' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Uniform items must be an array' using errcode = '22023';
  end if;

  select id, status into target_request_id, current_status
  from public.uniform_requests where player_id = p_player_id for update;
  if target_request_id is not null and not (select private.is_admin()) and current_status in ('preparing', 'issued') then
    raise exception 'Uniform request is locked' using errcode = '42501';
  end if;

  if target_request_id is null then
    insert into public.uniform_requests(player_id, number, surname_print, status, requested_by, updated_by)
    values (p_player_id, p_number, nullif(trim(p_surname_print), ''), 'requested', (select auth.uid()), (select auth.uid()))
    returning id into target_request_id;
  else
    update public.uniform_requests
    set number = p_number, surname_print = nullif(trim(p_surname_print), ''), status = 'requested',
        requested_by = coalesce(requested_by, (select auth.uid())), updated_by = (select auth.uid())
    where id = target_request_id;
    delete from public.uniform_request_items where request_id = target_request_id;
  end if;

  for item in select value from jsonb_array_elements(p_items) loop
    catalog_id := (item ->> 'catalog_item_id')::uuid;
    selected_size := trim(item ->> 'size');
    select sizes into catalog_sizes
    from public.uniform_catalog_items where id = catalog_id and is_active;
    if catalog_sizes is null then
      raise exception 'Active catalog item not found' using errcode = 'P0002';
    end if;
    if selected_size is null or selected_size = ''
      or (cardinality(catalog_sizes) > 0 and not selected_size = any(catalog_sizes)) then
      raise exception 'Invalid uniform size' using errcode = '22023';
    end if;
    insert into public.uniform_request_items(request_id, catalog_item_id, size, quantity, actor_id)
    values (target_request_id, catalog_id, selected_size, 1, (select auth.uid()));
  end loop;
  return target_request_id;
end;
$$;

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

  delete from public.attendance_records where session_id = target_session_id;
  insert into public.attendance_records(session_id, player_id, status, note, actor_id)
  select target_session_id, (entry ->> 'player_id')::uuid,
         (entry ->> 'status')::public.attendance_status,
         nullif(left(trim(entry ->> 'note'), 500), ''), (select auth.uid())
  from jsonb_array_elements(p_records) as entries(entry);
  return target_session_id;
end;
$$;
