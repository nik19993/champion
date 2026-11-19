set local lock_timeout = '5s';

-- Local clock times for a recurring week. These rows are independent of events.
create table public.club_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 1 and 7),
  start_time time(0) not null,
  end_time time(0) not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  venue_id uuid references public.venues(id) on delete set null,
  venue_part text not null default 'whole' check (venue_part in ('whole', 'left', 'right')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_schedule_same_day_times check (
    start_time < end_time and end_time < time '24:00:00'
    and extract(second from start_time) = 0 and extract(second from end_time) = 0
  )
);

create index club_schedule_slots_group_idx on public.club_schedule_slots(group_id);
create index club_schedule_slots_coach_idx on public.club_schedule_slots(coach_id);
create index club_schedule_slots_venue_idx on public.club_schedule_slots(venue_id);

alter table public.club_schedule_slots enable row level security;
revoke all on table public.club_schedule_slots from public, anon, authenticated;
grant select, insert, update, delete on table public.club_schedule_slots to authenticated;

create policy club_schedule_admin_all on public.club_schedule_slots
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create trigger club_schedule_slots_set_updated_at before update on public.club_schedule_slots
  for each row execute function private.set_updated_at();
create trigger club_schedule_slots_audit after insert or update or delete on public.club_schedule_slots
  for each row execute function private.audit_change();

-- Share only schedule fields and the names needed to read the timetable. The
-- existing group/profile policies continue to protect all other data.
create function private.list_club_weekly_schedule()
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $function$
declare
  schedule jsonb;
begin
  if not ((select private.is_admin()) or exists (
    select 1 from public.profiles viewer
    where viewer.id = (select auth.uid()) and viewer.role = 'coach' and viewer.status = 'active'
  )) then
    raise exception 'Club schedule access denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'weekday', s.weekday,
    'start_time', s.start_time,
    'end_time', s.end_time,
    'group_id', s.group_id,
    'group_code', coalesce(nullif(g.display_code, ''), g.code),
    'coach_id', s.coach_id,
    'coach_name', c.full_name,
    'venue_id', s.venue_id,
    'venue_name', v.name,
    'booking_venue_id', coalesce(v.parent_venue_id, v.id),
    'booking_venue_name', coalesce(parent.name, v.name),
    'venue_part', case
      when v.parent_venue_id is not null then v.venue_part
      when v.venue_type in ('field', 'small_pitch') or v.supports_half_booking then s.venue_part
      else 'whole'
    end
  ) order by s.weekday, s.start_time, s.end_time, s.id), '[]'::jsonb)
  into schedule
  from public.club_schedule_slots s
  join public.groups g on g.id = s.group_id
  left join public.profiles c on c.id = s.coach_id
  left join public.venues v on v.id = s.venue_id
  left join public.venues parent on parent.id = v.parent_venue_id;

  return schedule;
end;
$function$;

create function public.list_club_weekly_schedule()
returns jsonb
language sql
stable security invoker
set search_path = ''
as $function$
  select private.list_club_weekly_schedule();
$function$;

revoke execute on function private.list_club_weekly_schedule() from public, anon, authenticated;
revoke execute on function public.list_club_weekly_schedule() from public, anon, authenticated;
grant execute on function private.list_club_weekly_schedule() to authenticated;
grant execute on function public.list_club_weekly_schedule() to authenticated;
