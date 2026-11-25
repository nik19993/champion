set local lock_timeout = '5s';

-- Junior is a category, with no invented age band. Existing A/B/C bands are unchanged.
alter table public.groups drop constraint groups_shape_v5;
alter table public.groups add constraint groups_shape_v6 check (
  (group_kind='age' and age is not null and age between 6 and 17
    and ((age in (6,7) and team_suffix is null and code='U'||age::text)
      or (team_suffix is not null and team_suffix ~ '^[A-Z]$' and code='U'||age::text||team_suffix)))
  or (group_kind='goalkeeper' and age is null and team_suffix is not null
    and team_suffix in ('A','B','C') and code='Воротарі '||team_suffix)
  or (group_kind='location' and age is null and display_age is null and cohort_birth_year is null
    and team_suffix is not null and team_suffix in ('A','B','C','Junior')
    and code ~ '^Локація № [1-9][0-9]{0,3} (A|B|C|Junior)$'
    and split_part(code,' ',4)=team_suffix)
);

create or replace function private.create_location_group(p_school_number integer,p_category text,p_request_id uuid,p_location_name text,p_venue_id uuid)
returns public.groups language plpgsql security definer set search_path='' as $$
declare
  category text := case when lower(btrim(p_category))='junior' then 'Junior' else upper(btrim(coalesce(p_category,''))) end;
  target public.groups%rowtype;
  place public.club_locations%rowtype;
  selected_venue uuid;
begin
  if not (select private.is_admin()) then raise exception 'MFA_REQUIRED' using errcode='42501'; end if;
  if p_school_number is null or p_school_number not between 1 and 9999 or category not in ('A','B','C','Junior') or p_request_id is null then
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

-- The occupancy board excludes location-only halls. A real venue shared with
-- a main/goalkeeper group remains visible, including bookings made for a child half.
-- This does not change the venue directory, event bookings, conflicts or schedules.
create view public.admin_venue_occupancy_venues
with (security_invoker=true, security_barrier=true) as
select v.id, v.name, v.venue_type, v.is_active, v.supports_half_booking,
       v.parent_venue_id, v.venue_part
from public.venues v
where (select private.is_admin()) and (
  not exists (
    select 1 from public.club_locations l
    join public.venues location_venue on location_venue.id=l.venue_id
    where coalesce(location_venue.parent_venue_id,location_venue.id)=coalesce(v.parent_venue_id,v.id)
  )
  or exists (
    select 1 from public.club_schedule_slots s
    join public.groups g on g.id=s.group_id
    join public.venues scheduled_venue on scheduled_venue.id=s.venue_id
    where g.group_kind<>'location'
      and coalesce(scheduled_venue.parent_venue_id,scheduled_venue.id)=coalesce(v.parent_venue_id,v.id)
  )
  or exists (
    select 1 from public.events e
    join public.groups g on g.id=e.group_id
    left join public.venues event_venue on event_venue.id=e.venue_id
    where g.group_kind<>'location' and e.status<>'cancelled'
      and coalesce(e.booking_venue_id,event_venue.parent_venue_id,e.venue_id)=coalesce(v.parent_venue_id,v.id)
  )
);
revoke all on public.admin_venue_occupancy_venues from public, anon, authenticated;
grant select on public.admin_venue_occupancy_venues to authenticated, service_role;
comment on view public.admin_venue_occupancy_venues is
  'Admin occupancy board only: hides dedicated location halls; preserves shared main-team venues. Underlying RLS applies.';

-- Keep group-membership validation and existing award rules; fix the invalid
-- interval literal that prevented award inserts for any group.
CREATE OR REPLACE FUNCTION private.validate_monthly_star_award()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  player_group_id uuid;
  theme_month date;
  active_cards integer;
begin
  select p.group_id into player_group_id from public.players p where p.id = new.player_id;
  if not (tg_op='UPDATE' and new.revoked_at is not null and new.player_id=old.player_id and new.group_id=old.group_id and new.month=old.month)
    and (player_group_id is null or not private.player_in_group_on(new.player_id,new.group_id,least((new.month+interval '1 month'-interval '1 day')::date,(now() at time zone 'Europe/Kyiv')::date))) then
    raise exception 'PLAYER_GROUP_MISMATCH' using errcode = '23514';
  end if;

  select t.month into theme_month from public.monthly_star_themes t where t.id = new.theme_id;
  if theme_month is null or theme_month <> new.month then
    raise exception 'THEME_MONTH_MISMATCH' using errcode = '23514';
  end if;

  if new.revoked_at is null then
    select count(*)::integer into active_cards
    from public.player_behavior_cards c
    where c.player_id = new.player_id and c.month = new.month and not c.is_voided;
    if active_cards >= 4 then
      raise exception 'PLAYER_INELIGIBLE_FOR_MONTHLY_STAR' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' and new.selected_by is null then new.selected_by := (select auth.uid()); end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end;
$function$;
