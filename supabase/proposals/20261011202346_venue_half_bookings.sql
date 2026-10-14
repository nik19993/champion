-- APPROVED CODE PROPOSAL ONLY. Not applied to champion-staging or production.
-- Existing legacy half entries must be explicitly linked by an administrator.
-- Never infer parentage from names; no existing events are deleted or cancelled.
begin;
set local search_path = public, extensions, pg_catalog;
create extension if not exists btree_gist with schema extensions;

alter table public.venues
  add column supports_half_booking boolean not null default false,
  add column parent_venue_id uuid references public.venues(id) on delete restrict,
  add column venue_part text not null default 'whole',
  add constraint venues_part_check check (
    (parent_venue_id is null and venue_part = 'whole') or
    (parent_venue_id is not null and parent_venue_id <> id and venue_part in ('left', 'right'))
  );
create index venues_parent_idx on public.venues(parent_venue_id) where parent_venue_id is not null;

alter table public.events
  add column venue_part text not null default 'whole' check (venue_part in ('whole', 'left', 'right')),
  add column booking_venue_id uuid,
  add column booking_part text not null default 'whole' check (booking_part in ('whole', 'left', 'right'));

-- Only derived booking metadata is initialized. Original venue_id, timestamps,
-- coach, status, group, attendance and history remain intact.
update public.events set booking_venue_id = venue_id;

alter table public.events
  add constraint events_booking_end_check check (ends_at = start_at + make_interval(mins => duration_minutes)),
  add constraint events_venue_booking_excl exclude using gist (
    booking_venue_id with =,
    int4range(case when booking_part = 'right' then 1 else 0 end,
              case when booking_part = 'left' then 1 else 2 end, '[)') with &&,
    tstzrange(start_at, ends_at, '[)') with &&
  ) where (status = 'scheduled' and booking_venue_id is not null),
  add constraint events_coach_booking_excl exclude using gist (
    coach_id with =, tstzrange(start_at, ends_at, '[)') with &&
  ) where (status = 'scheduled');
-- Constraint creation aborts the entire transaction if existing conflicts or
-- inconsistent end times exist. Never resolve them by changing live records here.

create or replace function private.validate_venue_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
declare parent public.venues%rowtype;
begin
  if new.parent_venue_id is not null then
    if new.parent_venue_id = new.id then
      raise exception 'Майданчик не може бути частиною самого себе' using errcode = '23514';
    end if;
    select * into parent from public.venues where id = new.parent_venue_id for share;
    if not found or parent.parent_venue_id is not null then
      raise exception 'Виберіть цілий фізичний майданчик, а не його частину' using errcode = '23514';
    end if;
    if not (parent.venue_type in ('field','small_pitch') or parent.supports_half_booking) then
      raise exception 'Для цього майданчика поділ на половини не увімкнено' using errcode = '23514';
    end if;
    if exists (select 1 from public.venues where parent_venue_id = new.id) then
      raise exception 'Майданчик із власними частинами не можна приєднати до іншого' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    -- Linking an old standalone half is permitted. Moving a previously linked
    -- half with historical events requires a separate reviewed data operation.
    if old.parent_venue_id is not null
       and (new.parent_venue_id is distinct from old.parent_venue_id or new.venue_part <> old.venue_part)
       and exists (select 1 from public.events where venue_id = new.id) then
      raise exception 'Ця частина має історію подій. Змінювати її прив’язку без окремої перевірки не можна' using errcode = '23514';
    end if;
    if old.parent_venue_id is null and new.parent_venue_id is not null
       and exists (select 1 from public.events where venue_id = new.id and venue_part <> 'whole') then
      raise exception 'Майданчик уже має бронювання власних половин. Спочатку перевірте його історію' using errcode = '23514';
    end if;
  end if;
  if not (new.venue_type in ('field','small_pitch') or new.supports_half_booking)
     and new.parent_venue_id is null
     and (exists (select 1 from public.venues where parent_venue_id = new.id)
          or exists (select 1 from public.events where venue_id = new.id and venue_part <> 'whole')) then
    raise exception 'Поділ використовується частинами або історичними подіями' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger venues_00_validate_booking before insert or update on public.venues
for each row execute function private.validate_venue_booking();

create or replace function private.resolve_event_venue_booking()
returns trigger language plpgsql security definer set search_path = '' as $$
declare venue public.venues%rowtype; parent public.venues%rowtype;
begin
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
$$;
create trigger events_01_resolve_venue_booking before insert or update on public.events
for each row execute function private.resolve_event_venue_booking();

create or replace function private.sync_venue_booking_links()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.parent_venue_id is distinct from old.parent_venue_id or new.venue_part <> old.venue_part then
    -- Keep the original event venue_id and all history. Recompute only the
    -- booking identity/part. Any collision rolls back the mapping and refresh.
    update public.events set venue_id = venue_id where venue_id = new.id;
  end if;
  return new;
end;
$$;
create trigger venues_sync_booking_links after update on public.venues
for each row execute function private.sync_venue_booking_links();

create or replace function private.prevent_event_conflict()
returns trigger language plpgsql security definer set search_path = '' as $$
declare conflict_record record;
begin
  if new.status <> 'scheduled' then return new; end if;
  select e.id, coalesce(g.display_code, g.code) as code, e.start_at, e.ends_at, e.booking_part,
         case when e.coach_id = new.coach_id then 'тренер' else 'майданчик' end as resource_type
    into conflict_record
  from public.events e join public.groups g on g.id = e.group_id
  where e.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and e.status = 'scheduled' and e.start_at < new.ends_at and e.ends_at > new.start_at
    and (e.coach_id = new.coach_id or
      (new.booking_venue_id is not null and e.booking_venue_id = new.booking_venue_id
       and (e.booking_part = 'whole' or new.booking_part = 'whole' or e.booking_part = new.booking_part)))
  order by e.start_at limit 1;
  if found then
    raise exception 'EVENT_CONFLICT: % зайнятий; група %, % — %', conflict_record.resource_type,
      conflict_record.code, conflict_record.start_at, conflict_record.ends_at using errcode = '23P01';
  end if;
  return new;
end;
$$;
-- Include half changes and all derived updates. Exclusion constraints, rather
-- than this readable-message SELECT, enforce safety under concurrent writes.
drop trigger events_prevent_conflict on public.events;
create trigger events_prevent_conflict before insert or update on public.events
for each row execute function private.prevent_event_conflict();

create or replace function public.venue_booking_conflicts(
  p_venue_id uuid, p_start_at timestamptz, p_duration_minutes integer,
  p_exclude_event_id uuid default null
)
returns table(venue_part text, start_at timestamptz, ends_at timestamptz, group_code text)
language plpgsql stable security definer set search_path = '' as $$
declare root_id uuid;
begin
  if (select auth.uid()) is null or not (select private.is_active_user()) then
    raise exception 'Доступ заборонено' using errcode = '42501';
  end if;
  if p_start_at is null or p_duration_minutes is null or p_duration_minutes not between 15 and 360 then
    raise exception 'Некоректний час або тривалість' using errcode = '22023';
  end if;
  if p_exclude_event_id is not null and not exists (
    select 1 from public.events e where e.id = p_exclude_event_id and
      ((select private.is_admin()) or
       (e.coach_id = (select auth.uid()) and exists
         (select 1 from public.coach_group_assignments a where a.coach_id = (select auth.uid()) and a.group_id = e.group_id and a.is_active)))
  ) then raise exception 'Доступ до редагування події заборонено' using errcode = '42501'; end if;
  select coalesce(v.parent_venue_id, v.id) into root_id from public.venues v where v.id = p_venue_id;
  if not found then raise exception 'Майданчик не знайдено' using errcode = '22023'; end if;
  return query
    select e.booking_part, e.start_at, e.ends_at, coalesce(g.display_code, g.code)::text
    from public.events e left join public.groups g on g.id = e.group_id
    where e.booking_venue_id = root_id and e.status = 'scheduled'
      and (p_exclude_event_id is null or e.id <> p_exclude_event_id)
      and tstzrange(e.start_at,e.ends_at,'[)') && tstzrange(p_start_at,p_start_at + make_interval(mins => p_duration_minutes),'[)')
    order by e.start_at;
end;
$$;
revoke all on function public.venue_booking_conflicts(uuid,timestamptz,integer,uuid) from public, anon;
grant execute on function public.venue_booking_conflicts(uuid,timestamptz,integer,uuid) to authenticated;
revoke all on function private.validate_venue_booking() from public, anon, authenticated;
revoke all on function private.resolve_event_venue_booking() from public, anon, authenticated;
revoke all on function private.sync_venue_booking_links() from public, anon, authenticated;
revoke all on function private.prevent_event_conflict() from public, anon, authenticated;
-- Existing event/venue RLS and admin MFA remain unchanged.
commit;
