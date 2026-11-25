-- Execute inside a transaction after the location-group migration, then roll back.
-- Uses existing staff identities only as JWT claims; their credentials are untouched.
do $test$
declare
  administrator uuid;
  coach_one uuid;
  coach_two uuid;
  group_a public.groups%rowtype;
  group_b public.groups%rowtype;
  group_elsewhere public.groups%rowtype;
  replay public.groups%rowtype;
  request_id uuid := gen_random_uuid();
  first_event uuid;
  player_id uuid;
  fixed_venue uuid;
  away_venue uuid;
  venue_count integer;
begin
  select id into administrator from public.profiles where role='admin' and status='active' limit 1;
  select id into coach_one from public.profiles where role='coach' and status='active' order by id limit 1;
  select id into coach_two from public.profiles where role='coach' and status='active' and id<>coach_one order by id limit 1;
  if administrator is null or coach_two is null then raise exception 'TEST_STAFF_REQUIRED'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal1')::text,true);
  begin
    perform public.create_location_group(9901,'A',request_id);
    raise exception 'ADMIN_AAL1_CREATED_GROUP';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal2')::text,true);
  select * into group_a from public.create_location_group(9901,'A',request_id);
  select * into replay from public.create_location_group(9901,'A',request_id);
  if group_a.id<>replay.id or group_a.code<>'Локація № 9901 A' or group_a.age is not null then raise exception 'GROUP_IDENTITY_OR_REPLAY'; end if;
  begin
    perform public.create_location_group(9901,'A',gen_random_uuid());
    raise exception 'DUPLICATE_CREATED';
  exception when unique_violation then null; end;
  begin
    perform public.create_location_group(9901,'D',gen_random_uuid());
    raise exception 'INVALID_CATEGORY_CREATED';
  exception when invalid_parameter_value then null; end;
  select * into group_b from public.create_location_group(9901,'B',gen_random_uuid());
  select * into group_elsewhere from public.create_location_group(9902,'C',gen_random_uuid());
  select venue_id into fixed_venue from public.club_locations where id=group_a.location_id;
  if fixed_venue is null or (select venue_id from public.club_locations where id=group_b.location_id)<>fixed_venue then raise exception 'SHARED_LOCATION_VENUE'; end if;
  select count(*) into venue_count from public.venues;
  select * into replay from public.create_location_group(9901,'C',gen_random_uuid());
  if (select count(*) from public.venues)<>venue_count then raise exception 'DUPLICATE_LOCATION_VENUE'; end if;
  -- There is no 15-team cap.
  for i in 9910..9925 loop perform public.create_location_group(i,'A',gen_random_uuid()); end loop;
  insert into public.coach_group_assignments(coach_id,group_id,created_by) values
    (coach_one,group_a.id,administrator),(coach_two,group_b.id,administrator),(coach_two,group_elsewhere.id,administrator);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  if not exists(select 1 from public.groups where id=group_a.id) or exists(select 1 from public.groups where id=group_b.id) then raise exception 'ASSIGNMENT_RLS'; end if;
  if not exists(select 1 from public.club_locations where id=group_a.location_id)
    or exists(select 1 from public.club_locations where id=group_elsewhere.location_id) then raise exception 'LOCATION_RLS'; end if;
  if not private.has_assigned_age(6) or not private.has_assigned_age(8) then raise exception 'LOCATION_AGE_ACCESS'; end if;
  begin
    perform public.create_location_group(9929,'A',gen_random_uuid());
    raise exception 'COACH_CREATED_GROUP';
  exception when insufficient_privilege then null; end;
  player_id := public.save_player_profile(group_a.id,null,jsonb_build_object('full_name','Перевірка Гравець'),null);
  if not exists(select 1 from public.players where id=player_id and group_id=group_a.id) then raise exception 'LOCATION_ROSTER_WRITE'; end if;
  insert into public.events(group_id,event_type,start_at,duration_minutes,venue_id,venue_part,coach_id,created_by)
  values(group_a.id,'training','2098-01-10 10:00:00+00',60,null,'left',coach_one,coach_one) returning id into first_event;
  if not exists(select 1 from public.events where id=first_event and venue_id=fixed_venue and booking_venue_id=fixed_venue and venue_part='whole') then raise exception 'AUTOMATIC_TRAINING_VENUE'; end if;
  select id into away_venue from public.venues where venue_type='away' limit 1;
  insert into public.events(group_id,event_type,start_at,duration_minutes,venue_id,coach_id,created_by)
  values(group_a.id,'oblast','2098-01-10 11:00:00+00',60,away_venue,coach_one,coach_one);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_two,'role','authenticated','aal','aal1')::text,true);
  begin
    insert into public.events(group_id,event_type,start_at,duration_minutes,coach_id,created_by)
    values(group_b.id,'training','2098-01-10 10:00:00+00',60,coach_two,coach_two);
    raise exception 'SHARED_HALL_CONFLICT_MISSED';
  exception when exclusion_violation then null; end;
  insert into public.events(group_id,event_type,start_at,duration_minutes,coach_id,created_by)
  values(group_elsewhere.id,'training','2098-01-10 10:00:00+00',60,coach_two,coach_two);
  insert into public.events(group_id,event_type,start_at,duration_minutes,venue_id,coach_id,created_by)
  values(group_elsewhere.id,'oblast','2098-01-10 11:00:00+00',60,away_venue,coach_two,coach_two);
  execute 'reset role';
end;
$test$;
