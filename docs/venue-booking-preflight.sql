-- READ ONLY. Run against an isolated restored copy before applying the proposal.
select id, name, venue_type, is_active from public.venues order by name;

select id, start_at, ends_at, duration_minutes
from public.events
where ends_at is distinct from start_at + make_interval(mins => duration_minutes);

select a.id as first_event, b.id as second_event,
       a.start_at, a.ends_at, b.start_at, b.ends_at,
       case when a.coach_id = b.coach_id then 'coach' else 'venue' end as resource
from public.events a join public.events b on a.id < b.id
where a.status = 'scheduled' and b.status = 'scheduled'
  and a.start_at < b.ends_at and b.start_at < a.ends_at
  and (a.coach_id = b.coach_id or (a.venue_id is not null and a.venue_id = b.venue_id));

-- This cannot detect whole/half conflicts across unrelated legacy venue IDs.
-- Review physical-parent mappings explicitly; no names-based automatic mapping.
