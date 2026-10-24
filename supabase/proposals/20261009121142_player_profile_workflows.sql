-- PROPOSAL ONLY. Review new coach permissions before applying.
begin;
create function private.can_manage_player_group(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or (
    private.has_group(p_group_id) and exists (
      select 1 from public.profiles where id = (select auth.uid()) and role = 'coach' and status = 'active'
    )
  );
$$;
revoke all on function private.can_manage_player_group(uuid) from public, anon, authenticated;

create function public.save_player_profile(p_group_id uuid, p_player_id uuid, p_values jsonb, p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.players%rowtype;
  player_name text := trim(p_values ->> 'full_name');
  dob date := nullif(p_values ->> 'birth_date','')::date;
  yob integer := nullif(p_values ->> 'birth_year','')::integer;
  result_id uuid;
begin
  if not private.can_manage_player_group(p_group_id) then raise exception 'Group access required' using errcode='42501'; end if;
  perform id from public.groups where id = p_group_id and is_active for update;
  if not found then raise exception 'ACTIVE_GROUP_REQUIRED' using errcode='22023'; end if;
  if player_name is null or char_length(player_name) not between 2 and 180 then
    raise exception 'PLAYER_NAME_REQUIRED' using errcode='22023';
  end if;
  if dob > current_date or (yob is not null and yob not between 2000 and 2100) then
    raise exception 'INVALID_BIRTH_DATE' using errcode='22023';
  end if;
  if dob is not null then
    if yob is not null and yob <> extract(year from dob)::integer then
      raise exception 'BIRTH_YEAR_DATE_MISMATCH' using errcode='22023';
    end if;
    yob := extract(year from dob)::integer;
  end if;
  if char_length(coalesce(p_values->>'position','')) > 120 or char_length(coalesce(p_values->>'dominant_foot','')) > 40 then
    raise exception 'PLAYER_FIELD_TOO_LONG' using errcode='22023';
  end if;
  if p_player_id is not null then
    select * into target from public.players where id=p_player_id and group_id=p_group_id and is_active for update;
    if target.id is null then raise exception 'ACTIVE_PLAYER_REQUIRED' using errcode='22023'; end if;
    if p_expected_updated_at is null or target.updated_at is distinct from p_expected_updated_at then
      raise exception 'PLAYER_CHANGED_RELOAD' using errcode='40001';
    end if;
  end if;
  if exists(select 1 from public.players where group_id=p_group_id and is_active and lower(trim(full_name))=lower(player_name) and id is distinct from p_player_id) then
    raise exception 'PLAYER_NAME_AMBIGUOUS' using errcode='23505';
  end if;
  if p_player_id is null then
    insert into public.players(group_id,full_name,birth_date,birth_year,position,dominant_foot,created_by,updated_by)
    values(p_group_id,player_name,dob,yob,nullif(trim(p_values->>'position'),''),nullif(trim(p_values->>'dominant_foot'),''),(select auth.uid()),(select auth.uid())) returning id into result_id;
  else
    update public.players set full_name=player_name,birth_date=dob,birth_year=yob,
      position=nullif(trim(p_values->>'position'),''),dominant_foot=nullif(trim(p_values->>'dominant_foot'),''),updated_by=(select auth.uid())
    where id=p_player_id returning id into result_id;
  end if;
  return result_id;
end;
$$;

create function public.save_player_guardian(p_player_id uuid,p_guardian_id uuid,p_values jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.players%rowtype;
  result_id uuid;
begin
  select * into target from public.players where id=p_player_id and is_active for update;
  if target.id is null or not private.can_manage_player_group(target.group_id) then
    raise exception 'Group access required' using errcode='42501';
  end if;
  if char_length(coalesce(p_values->>'phone','')) > 50 or char_length(coalesce(p_values->>'full_name','')) > 180
    or char_length(coalesce(p_values->>'email','')) > 254 or char_length(coalesce(p_values->>'relation','')) > 80 then
    raise exception 'CONTACT_FIELD_TOO_LONG' using errcode='22023';
  end if;
  if p_guardian_id is null then
    insert into public.guardians(player_id,full_name,phone,email,relation,created_by,updated_by)
    values(p_player_id,nullif(trim(p_values->>'full_name'),''),nullif(trim(p_values->>'phone'),''),nullif(trim(p_values->>'email'),''),nullif(trim(p_values->>'relation'),''),(select auth.uid()),(select auth.uid())) returning id into result_id;
  else
    update public.guardians set full_name=nullif(trim(p_values->>'full_name'),''),phone=nullif(trim(p_values->>'phone'),''),
      email=nullif(trim(p_values->>'email'),''),relation=nullif(trim(p_values->>'relation'),''),updated_by=(select auth.uid())
    where id=p_guardian_id and player_id=p_player_id returning id into result_id;
    if result_id is null then raise exception 'CONTACT_NOT_FOUND' using errcode='22023'; end if;
  end if;
  return result_id;
end;
$$;

-- Archiving, never DELETE: attendance, tests, awards and contact history survive.
create function public.archive_player(p_player_id uuid,p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.players%rowtype;
begin
  select * into target from public.players where id=p_player_id and is_active for update;
  if target.id is null or not private.can_manage_player_group(target.group_id) then
    raise exception 'Group access required' using errcode='42501';
  end if;
  if p_expected_updated_at is null or target.updated_at is distinct from p_expected_updated_at then
    raise exception 'PLAYER_CHANGED_RELOAD' using errcode='40001';
  end if;
  update public.players set is_active=false,active_to=greatest(current_date,active_from),updated_by=(select auth.uid()) where id=p_player_id;
end;
$$;
revoke all on function public.save_player_profile(uuid,uuid,jsonb,timestamptz) from public, anon;
revoke all on function public.save_player_guardian(uuid,uuid,jsonb) from public, anon;
revoke all on function public.archive_player(uuid,timestamptz) from public, anon;
grant execute on function public.save_player_profile(uuid,uuid,jsonb,timestamptz) to authenticated;
grant execute on function public.save_player_guardian(uuid,uuid,jsonb) to authenticated;
grant execute on function public.archive_player(uuid,timestamptz) to authenticated;
commit;
