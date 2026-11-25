-- Location groups have a broad age band and keep their identity across seasons.
-- Existing schedules, groups, players and coach assignments are not rewritten.
create table public.club_locations (
  id uuid primary key default gen_random_uuid(),
  school_number smallint not null unique check (school_number between 1 and 9999),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  venue_id uuid references public.venues(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.club_locations enable row level security;
revoke all on public.club_locations from anon;
grant select, insert, update, delete on public.club_locations to authenticated;
grant all on public.club_locations to service_role;

alter table public.groups add column location_id uuid references public.club_locations(id) on delete restrict;
create index groups_location_id_idx on public.groups(location_id);
create index club_locations_venue_id_idx on public.club_locations(venue_id);
alter table public.groups drop constraint groups_kind_check;
alter table public.groups add constraint groups_kind_check check (group_kind in ('age','goalkeeper','location'));
alter table public.groups drop constraint groups_shape_v4;
alter table public.groups add constraint groups_shape_v5 check (
  (group_kind='age' and age is not null and age between 6 and 17
    and ((age in (6,7) and team_suffix is null and code='U'||age::text)
      or (team_suffix is not null and team_suffix ~ '^[A-Z]$' and code='U'||age::text||team_suffix)))
  or (group_kind='goalkeeper' and age is null and team_suffix is not null
    and team_suffix in ('A','B','C') and code='Воротарі '||team_suffix)
  or (group_kind='location' and age is null and display_age is null and cohort_birth_year is null
    and team_suffix is not null and team_suffix in ('A','B','C')
    and code ~ '^Локація № [1-9][0-9]{0,3} [ABC]$')
);
alter table public.groups add constraint groups_location_shape check (
  (group_kind='location' and location_id is not null) or (group_kind<>'location' and location_id is null)
);
create unique index groups_location_category_key on public.groups(location_id,team_suffix) where group_kind='location';

create policy locations_admin_all on public.club_locations for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
create policy locations_assigned_read on public.club_locations for select to authenticated using (
  exists(select 1 from public.groups g where g.location_id=club_locations.id and (select private.has_group(g.id)))
);
create trigger club_locations_set_updated_at before update on public.club_locations
for each row execute function private.set_updated_at();
create trigger club_locations_audit after insert or update or delete on public.club_locations
for each row execute function private.audit_change();

-- This directory is derived from the existing schedule; no teams or sessions are seeded.
insert into public.club_locations(school_number,name)
select distinct school_number,'ЗОШ № '||school_number::text from public.location_schedule_entries
on conflict(school_number) do nothing;

create function private.location_min_age(category text) returns integer language sql immutable set search_path=''
as $$ select case category when 'A' then 6 when 'B' then 9 when 'C' then 13 end $$;
create function private.location_max_age(category text) returns integer language sql immutable set search_path=''
as $$ select case category when 'A' then 8 when 'B' then 12 when 'C' then 17 end $$;
revoke all on function private.location_min_age(text),private.location_max_age(text) from public;
grant execute on function private.location_min_age(text),private.location_max_age(text) to authenticated,service_role;

create function private.create_location_group(p_school_number integer,p_category text,p_request_id uuid,p_location_name text,p_venue_id uuid)
returns public.groups language plpgsql security definer set search_path='' as $$
declare
  category text := upper(btrim(coalesce(p_category,'')));
  target public.groups%rowtype;
  place public.club_locations%rowtype;
  selected_venue uuid;
begin
  if not (select private.is_admin()) then raise exception 'MFA_REQUIRED' using errcode='42501'; end if;
  if p_school_number is null or p_school_number not between 1 and 9999 or category not in ('A','B','C') or p_request_id is null then
    raise exception 'INVALID_LOCATION_GROUP' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(6321092026);
  select * into target from public.groups where id=p_request_id;
  if found then
    if target.group_kind<>'location' or target.team_suffix is distinct from category
      or not exists(select 1 from public.club_locations where id=target.location_id and school_number=p_school_number) then
      raise exception 'INVALID_GROUP_REQUEST' using errcode='22023';
    end if;
    return target;
  end if;
  select * into place from public.club_locations where school_number=p_school_number for update;
  if not found then
    insert into public.club_locations(school_number,name)
    values(p_school_number,coalesce(nullif(btrim(p_location_name),''),'ЗОШ № '||p_school_number::text)) returning * into place;
  end if;
  if not place.is_active then raise exception 'LOCATION_INACTIVE' using errcode='22023'; end if;
  if exists(select 1 from public.groups where location_id=place.id and team_suffix=category) then
    raise exception 'GROUP_ALREADY_EXISTS' using errcode='23505';
  end if;
  if place.venue_id is null then
    if p_venue_id is null then
      insert into public.venues(name,venue_type,created_by,updated_by)
      values('Спортивний зал '||place.name,'hall',(select auth.uid()),(select auth.uid())) returning id into selected_venue;
    else
      select id into selected_venue from public.venues where id=p_venue_id and is_active and venue_type<>'away' and parent_venue_id is null for share;
      if not found then raise exception 'INVALID_LOCATION_VENUE' using errcode='22023'; end if;
    end if;
    update public.club_locations set venue_id=selected_venue where id=place.id returning * into place;
  elsif p_venue_id is not null and p_venue_id is distinct from place.venue_id then
    raise exception 'LOCATION_VENUE_CHANGED' using errcode='40001';
  end if;
  insert into public.groups(id,code,display_code,age,team_suffix,group_kind,location_id,is_active)
  values(p_request_id,'Локація № '||p_school_number::text||' '||category,'Локація № '||p_school_number::text||' '||category,null,category,'location',place.id,true)
  returning * into target;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,new_values)
  values((select auth.uid()),'create','groups',target.id,jsonb_build_object('code',target.code,'location_id',place.id));
  return target;
end; $$;
revoke all on function private.create_location_group(integer,text,uuid,text,uuid) from public;
grant execute on function private.create_location_group(integer,text,uuid,text,uuid) to authenticated,service_role;

create function public.create_location_group(p_school_number integer,p_category text,p_request_id uuid,p_location_name text default null,p_venue_id uuid default null)
returns public.groups language sql security invoker set search_path='' as $$
  select private.create_location_group(p_school_number,p_category,p_request_id,p_location_name,p_venue_id);
$$;
revoke all on function public.create_location_group(integer,text,uuid,text,uuid) from public,anon;
grant execute on function public.create_location_group(integer,text,uuid,text,uuid) to authenticated,service_role;

create policy tasks_location_read on public.methodology_tasks for select to authenticated using (
  is_active and audience='field' and age_from=age_to and exists (
    select 1 from public.groups g where g.group_kind='location' and g.is_active
      and (select private.has_group(g.id))
      and age_from between private.location_min_age(g.team_suffix) and private.location_max_age(g.team_suffix)
  )
);

create or replace function private.has_assigned_age(requested_age integer)
returns boolean language sql stable security definer set search_path='' as $$
  select (select private.is_active_user()) and exists (
    select 1 from public.groups g where g.is_active and (select private.has_group(g.id))
      and (coalesce(g.display_age,g.age)=requested_age
        or (g.group_kind='location' and requested_age between private.location_min_age(g.team_suffix) and private.location_max_age(g.team_suffix)))
  );
$$;


CREATE OR REPLACE FUNCTION private.require_primary_age_group()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from public.groups where id=new.group_id and group_kind in ('age','location')) then
    raise exception 'PRIMARY_AGE_GROUP_REQUIRED' using errcode='23514';
  end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.set_player_goalkeeper_group(p_player_id uuid, p_group_id uuid, p_expected_group_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.players%rowtype; current_membership public.player_group_memberships%rowtype; result_id uuid;
begin
  if not (select private.is_admin()) then raise exception 'MFA_REQUIRED' using errcode='42501'; end if;
  select * into target from public.players where id=p_player_id and is_active for update;
  if target.id is null then raise exception 'ACTIVE_PLAYER_REQUIRED' using errcode='22023'; end if;
  if not exists(select 1 from public.groups where id=target.group_id and group_kind in ('age','location')) then
    raise exception 'PRIMARY_AGE_GROUP_REQUIRED' using errcode='22023'; end if;
  select * into current_membership from public.player_group_memberships where player_id=p_player_id and active_to is null for update;
  if current_membership.group_id is not distinct from p_group_id then return current_membership.id; end if;
  if current_membership.group_id is distinct from p_expected_group_id then
    raise exception 'MEMBERSHIP_CHANGED_RELOAD' using errcode='40001'; end if;
  if p_group_id is not null and not exists(select 1 from public.groups where id=p_group_id and is_active and group_kind='goalkeeper') then
    raise exception 'GOALKEEPER_GROUP_REQUIRED' using errcode='22023'; end if;
  if current_membership.id is not null then
    update public.player_group_memberships set active_to=(now() at time zone 'Europe/Kyiv')::date,updated_by=(select auth.uid()) where id=current_membership.id;
  end if;
  if p_group_id is not null then
    insert into public.player_group_memberships(player_id,group_id,created_by,updated_by)
    values(p_player_id,p_group_id,(select auth.uid()),(select auth.uid())) returning id into result_id;
  end if;
  return result_id;
end;
$function$;


CREATE OR REPLACE FUNCTION private.validate_goalkeeper_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists(select 1 from public.groups where id=new.group_id and group_kind='goalkeeper' and is_active)
    or not exists(select 1 from public.players p join public.groups g on g.id=p.group_id
      where p.id=new.player_id and g.group_kind in ('age','location')) then
    raise exception 'AGE_PLAYER_AND_GOALKEEPER_GROUP_REQUIRED' using errcode='23514';
  end if;
  new.updated_at:=now();
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.transfer_player_group(p_player_id uuid, p_target_group_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare target public.players%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Group access required' using errcode='42501'; end if;
  select * into target from public.players where id=p_player_id and is_active for update;
  if target.id is null or not private.can_manage_player_group(target.group_id)
    or not private.can_manage_player_group(p_target_group_id) then
    raise exception 'Group access required' using errcode='42501';
  end if;
  if p_expected_updated_at is null or target.updated_at is distinct from p_expected_updated_at then
    raise exception 'PLAYER_CHANGED_RELOAD' using errcode='40001';
  end if;
  if p_target_group_id is null or p_target_group_id=target.group_id then
    raise exception 'DIFFERENT_GROUP_REQUIRED' using errcode='22023';
  end if;
  perform id from public.groups where id=p_target_group_id and is_active and group_kind in ('age','location') for update;
  if not found then raise exception 'ACTIVE_GROUP_REQUIRED' using errcode='22023'; end if;
  if exists(select 1 from public.players where group_id=p_target_group_id and is_active
    and lower(trim(full_name))=lower(trim(target.full_name)) and id<>p_player_id) then
    raise exception 'PLAYER_NAME_AMBIGUOUS' using errcode='23505';
  end if;
  update public.players set group_id=p_target_group_id,updated_by=(select auth.uid()) where id=p_player_id;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,old_values,new_values)
    values((select auth.uid()),'transfer','players',p_player_id,
      jsonb_build_object('group_id',target.group_id),jsonb_build_object('group_id',p_target_group_id));
  return p_player_id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.save_player_profile(p_group_id uuid, p_player_id uuid, p_values jsonb, p_expected_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target public.players%rowtype;
  player_name text := trim(p_values ->> 'full_name');
  dob date := nullif(p_values ->> 'birth_date','')::date;
  yob integer := nullif(p_values ->> 'birth_year','')::integer;
  result_id uuid;
begin
  if not private.can_manage_player_group(p_group_id) then raise exception 'Group access required' using errcode='42501'; end if;
  perform id from public.groups where id = p_group_id and is_active and group_kind in ('age','location') for update;
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
$function$;


CREATE OR REPLACE FUNCTION private.resolve_event_venue_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare venue public.venues%rowtype; parent public.venues%rowtype; fixed_venue uuid; location_training boolean;
begin
  select g.group_kind='location' and new.event_type='training', l.venue_id into location_training,fixed_venue
  from public.groups g left join public.club_locations l on l.id=g.location_id where g.id=new.group_id;
  if location_training then
    if fixed_venue is null then raise exception 'LOCATION_VENUE_REQUIRED' using errcode='23514'; end if;
    new.venue_id := fixed_venue;
    new.venue_part := 'whole';
  end if;
  -- Run for every write, including attempts to forge derived booking columns.
  new.ends_at := new.start_at + make_interval(mins => new.duration_minutes);
  new.booking_venue_id := null;
  new.booking_part := 'whole';
  if new.venue_id is null then
    new.venue_part := 'whole';
    return new;
  end if;
  select * into venue from public.venues where id = new.venue_id for share;
  if not found then raise exception 'Майданчик не знайдено' using errcode = '23503'; end if;
  if venue.venue_type = 'away' then
    new.venue_part := 'whole';
    return new;
  end if;
  new.booking_venue_id := coalesce(venue.parent_venue_id, venue.id);
  if venue.parent_venue_id is not null then
    select * into parent from public.venues where id = venue.parent_venue_id for share;
    new.venue_part := venue.venue_part;
  else
    if new.venue_part <> 'whole' and not (venue.venue_type in ('field','small_pitch') or venue.supports_half_booking) then
      raise exception 'Для цього майданчика поділ на половини не увімкнено' using errcode = '23514';
    end if;
  end if;
  new.booking_part := new.venue_part;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION private.attach_event_task_material(p_event_id uuid, p_task_id uuid, p_file_asset_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_group_id uuid;
  target_age integer;
  target_task_id uuid;
  asset public.file_assets%rowtype;
begin
  select e.group_id, coalesce(g.display_age, g.age, (select t.age_from from public.methodology_tasks t where t.id=e.task_id)), e.task_id
  into target_group_id, target_age, target_task_id
  from public.events e join public.groups g on g.id = e.group_id
  where e.id = p_event_id;
  if (select auth.uid()) is null or target_group_id is null
    or target_task_id is distinct from p_task_id
    or not (select private.has_group(target_group_id)) then
    raise exception 'Event task material permission denied' using errcode = '42501';
  end if;
  select * into asset from public.file_assets where id = p_file_asset_id for update;
  if asset.id is null or asset.owner_id is distinct from (select auth.uid())
    or asset.bucket <> 'task-documents' or asset.scan_status <> 'clean'
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
$function$;

