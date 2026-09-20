begin;

-- Overlapping events are rejected before they are stored, so these rows only
-- describe a coach's failed draft attempt. They are not actionable for admins
-- and must disappear after the coach corrects the time or venue.
delete from public.operational_items
where item_type = 'conflict';

commit;
