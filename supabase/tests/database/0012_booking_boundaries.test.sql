-- Run inside BEGIN ... ROLLBACK. No real bookings are changed.
do $test$
declare
  administrator uuid;
  coach_one uuid;
  coach_two uuid;
  group_one uuid;
  group_two uuid;
  field_id uuid;
  legacy_half uuid;
  first_id uuid;
  next_id uuid;
  first_part text;
  next_part text;
  parts_conflict boolean;
begin
  select id into administrator from public.profiles where role='admin' and status='active' order by id limit 1;
  select a.coach_id,a.group_id into coach_one,group_one from public.coach_group_assignments a join public.profiles p on p.id=a.coach_id join public.groups g on g.id=a.group_id where a.is_active and p.status='active' and p.role='coach' and g.is_active and g.group_kind='age' order by a.coach_id,a.group_id limit 1;
  select a.coach_id,a.group_id into coach_two,group_two from public.coach_group_assignments a join public.profiles p on p.id=a.coach_id join public.groups g on g.id=a.group_id where a.is_active and a.coach_id<>coach_one and p.status='active' and p.role='coach' and g.is_active and g.group_kind='age' order by a.coach_id,a.group_id limit 1;
  if administrator is null or coach_two is null then raise exception 'TEST_STAFF_REQUIRED'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal2')::text,true);
  insert into public.venues(name,venue_type,supports_half_booking) values('Тимчасове поле перевірки меж','small_pitch',true) returning id into field_id;
  insert into public.venues(name,venue_type,parent_venue_id,venue_part) values('Тимчасова ліва половина','small_pitch',field_id,'left') returning id into legacy_half;
  execute 'set local role authenticated';
  foreach first_part in array array['whole','left','right'] loop
    foreach next_part in array array['whole','left','right'] loop
      perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
      insert into public.events(group_id,event_type,start_at,duration_minutes,venue_id,venue_part,coach_id,created_by)
      values(group_one,'training','2098-01-10 17:00:00+02',60,field_id,first_part,coach_one,coach_one) returning id into first_id;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_two,'role','authenticated','aal','aal1')::text,true);
      if exists(select 1 from public.venue_booking_conflicts(field_id,'2098-01-10 18:00:00+02',60)) then raise exception 'ADJACENT_RPC_CONFLICT: % -> %',first_part,next_part; end if;
      insert into public.events(group_id,event_type,start_at,duration_minutes,venue_id,venue_part,coach_id,created_by)
      values(group_two,'training','2098-01-10 18:00:00+02',60,field_id,next_part,coach_two,coach_two) returning id into next_id;
      delete from public.events where id=next_id;
      parts_conflict := first_part='whole' or next_part='whole' or first_part=next_part;
      if not exists(select 1 from public.venue_booking_conflicts(field_id,'2098-01-10 17:59:00+02',60)) then raise exception 'ONE_MINUTE_RPC_OVERLAP_MISSED'; end if;
      begin
        insert into public.events(group_id,event_type,start_at,duration_minutes,venue_id,venue_part,coach_id,created_by)
        values(group_two,'training','2098-01-10 17:59:00+02',60,field_id,next_part,coach_two,coach_two) returning id into next_id;
        if parts_conflict then raise exception 'ONE_MINUTE_DB_OVERLAP_MISSED: % -> %',first_part,next_part; end if;
        delete from public.events where id=next_id;
      exception when exclusion_violation then
        if not parts_conflict then raise exception 'OPPOSITE_HALVES_BLOCKED'; end if;
      end;
      perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
      delete from public.events where id=first_id;
    end loop;
  end loop;
  insert into public.events(group_id,event_type,start_at,duration_minutes,venue_id,coach_id,created_by)
  values(group_one,'training','2098-01-10 17:00:00+02',60,legacy_half,coach_one,coach_one) returning id into first_id;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_two,'role','authenticated','aal','aal1')::text,true);
  if exists(select 1 from public.venue_booking_conflicts(legacy_half,'2098-01-10 18:00:00+02',60)) then raise exception 'LEGACY_HALF_ADJACENCY_BLOCKED'; end if;
  insert into public.events(group_id,event_type,start_at,duration_minutes,venue_id,coach_id,created_by)
  values(group_two,'training','2098-01-10 18:00:00+02',60,legacy_half,coach_two,coach_two);
  execute 'reset role';
end;
$test$;
