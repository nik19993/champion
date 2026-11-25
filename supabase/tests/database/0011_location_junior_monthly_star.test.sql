-- Run inside BEGIN ... ROLLBACK; all groups, rosters, awards and schedules here
-- are synthetic. Existing staff supply JWT identities, never new Auth accounts.
do $test$
declare
  administrator uuid;
  coach_one uuid;
  coach_two uuid;
  location_group public.groups%rowtype;
  junior public.groups%rowtype;
  replay public.groups%rowtype;
  category text;
  request_id uuid;
  hall uuid;
  first_player uuid;
  second_player uuid;
  foreign_player uuid;
  theme uuid;
  theme_month date := date '2098-01-01';
  main_group uuid;
  schedule_slot uuid;
  test_groups uuid[] := '{}';
begin
  select id into administrator from public.profiles where role='admin' and status='active' order by id limit 1;
  select id into coach_one from public.profiles where role='coach' and status='active' order by id limit 1;
  select id into coach_two from public.profiles where role='coach' and status='active' and id<>coach_one order by id limit 1;
  select id into main_group from public.groups where group_kind='age' and is_active order by id limit 1;
  if administrator is null or coach_two is null or main_group is null then raise exception 'TEST_STAFF_AND_MAIN_GROUP_REQUIRED'; end if;
  while exists(select 1 from public.monthly_star_themes where month=theme_month) loop
    theme_month := (theme_month+interval '1 month')::date;
  end loop;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal2')::text,true);
  insert into public.monthly_star_themes(month,title,description,created_by,updated_by)
  values(theme_month,'Перевірка локацій','Тимчасова тема транзакційної перевірки',administrator,administrator) returning id into theme;

  foreach category in array array['A','B','C','Junior'] loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal2')::text,true);
    request_id := gen_random_uuid();
    select * into location_group from public.create_location_group(9971,lower(category),request_id);
    test_groups := array_append(test_groups,location_group.id);
    if location_group.team_suffix<>category or location_group.code<>'Локація № 9971 '||category then raise exception 'CATEGORY_NOT_CANONICAL'; end if;
    if category='Junior' then
      junior := location_group;
      if private.location_min_age(category) is not null or private.location_max_age(category) is not null then raise exception 'INVENTED_JUNIOR_AGE'; end if;
      select * into replay from public.create_location_group(9971,' JUNIOR ',request_id);
      if replay.id<>junior.id then raise exception 'JUNIOR_REPLAY'; end if;
      begin
        perform public.create_location_group(9971,'Junior',gen_random_uuid());
        raise exception 'DUPLICATE_JUNIOR_CREATED';
      exception when unique_violation then null; end;
    end if;
    insert into public.coach_group_assignments(coach_id,group_id,created_by)
    values(coach_one,location_group.id,administrator);
    select venue_id into hall from public.club_locations where id=location_group.location_id;
    execute 'set local role authenticated';
    if exists(select 1 from public.admin_venue_occupancy_venues where id=hall) then raise exception 'DEDICATED_LOCATION_HALL_VISIBLE'; end if;

    perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
    if not exists(select 1 from public.venues where id=hall) then raise exception 'LOCATION_PLANNING_VENUE_HIDDEN'; end if;
    if exists(select 1 from public.admin_venue_occupancy_venues) then raise exception 'COACH_READ_ADMIN_VENUE_BOARD'; end if;
    first_player := public.save_player_profile(location_group.id,null,jsonb_build_object('full_name','Перевірка Перший'),null);
    second_player := public.save_player_profile(location_group.id,null,jsonb_build_object('full_name','Перевірка Другий'),null);
    if (select count(*) from public.group_player_ids(location_group.id,null))<>2 then raise exception 'LOCATION_STAR_ROSTER'; end if;
    perform public.save_monthly_star_awards(location_group.id,theme_month,theme,first_player,second_player);
    if (select count(*) from public.monthly_star_awards where group_id=location_group.id and month=theme_month and revoked_at is null)<>2 then raise exception 'LOCATION_WINNERS_NOT_SAVED'; end if;
    -- Revising a selection preserves history and leaves exactly two active awards.
    perform public.save_monthly_star_awards(location_group.id,theme_month,theme,second_player,first_player);
    if (select count(*) from public.monthly_star_awards where group_id=location_group.id and month=theme_month and revoked_at is null)<>2
      or (select count(*) from public.monthly_star_awards where group_id=location_group.id and month=theme_month and revoked_at is not null)<>2 then raise exception 'LOCATION_WINNERS_REVISION'; end if;
    if foreign_player is not null then
      begin
        perform public.save_monthly_star_awards(location_group.id,theme_month,theme,foreign_player,second_player);
        raise exception 'FOREIGN_GROUP_WINNER_ACCEPTED';
      exception when check_violation then null; end;
    end if;
    foreign_player := first_player;

    perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_two,'role','authenticated','aal','aal1')::text,true);
    if exists(select 1 from public.monthly_star_awards where group_id=location_group.id) then raise exception 'UNASSIGNED_COACH_READ_AWARDS'; end if;
    begin
      perform public.save_monthly_star_awards(location_group.id,theme_month,theme,first_player,second_player);
      raise exception 'UNASSIGNED_COACH_CHANGED_WINNERS';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal2')::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.monthly_star_awards where group_id=any(test_groups) and revoked_at is null)<>8 then raise exception 'ADMIN_CANNOT_READ_LOCATION_WINNERS'; end if;
  begin
    perform public.save_monthly_star_awards(junior.id,theme_month,theme,first_player,second_player);
    raise exception 'ADMIN_CHANGED_COACH_WINNERS';
  exception when insufficient_privilege then null; end;
  -- Sharing a hall with a main group makes it visible; removing only this
  -- synthetic slot makes the dedicated hall hidden again.
  insert into public.club_schedule_slots(weekday,start_time,end_time,group_id,venue_id)
  values(1,time '06:00',time '07:00',main_group,hall) returning id into schedule_slot;
  if not exists(select 1 from public.admin_venue_occupancy_venues where id=hall) then raise exception 'SHARED_MAIN_HALL_HIDDEN'; end if;
  delete from public.club_schedule_slots where id=schedule_slot;
  if exists(select 1 from public.admin_venue_occupancy_venues where id=hall) then raise exception 'DEDICATED_HALL_REAPPEARED'; end if;
  if has_table_privilege('anon','public.admin_venue_occupancy_venues','select') then raise exception 'ANON_BOARD_GRANT'; end if;
  execute 'reset role';
end;
$test$;
