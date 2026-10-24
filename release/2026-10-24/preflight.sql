-- Read-only. No player/contact contents, credential values or writes.
select version,name from supabase_migrations.schema_migrations order by version;
select count(*) as scheduled_conflict_pairs from public.events a join public.events b
 on a.id<b.id and a.status='scheduled' and b.status='scheduled'
 and tstzrange(a.start_at,a.ends_at,'[)')&&tstzrange(b.start_at,b.ends_at,'[)')
 and (a.coach_id=b.coach_id or (a.venue_id is not null and a.venue_id=b.venue_id));
select count(*) as inconsistent_event_ends from public.events where ends_at is distinct from start_at+make_interval(mins=>duration_minutes);
select group_kind,count(*) as groups from public.groups group by group_kind;
select count(*) as active_tasks from public.methodology_tasks where is_active;
select count(*) as active_terms from public.terminology_entries where is_active;
