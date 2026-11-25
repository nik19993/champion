-- Run inside BEGIN ... ROLLBACK. Existing identities are used as claims only.
do $test$
declare
  administrator uuid; coach_one uuid; keeper uuid;
  empty_group public.groups%rowtype; occupied public.groups%rowtype;
  player_id uuid; keeper_player uuid; past_event uuid; future_event uuid; slot_id uuid;
  result jsonb; before_keeper_count integer;
begin
  select id into administrator from public.profiles where role='admin' and status='active' order by id limit 1;
  select id into coach_one from public.profiles where role='coach' and status='active' order by id limit 1;
  select id into keeper from public.groups where group_kind='goalkeeper' and is_active order by team_suffix limit 1;
  if administrator is null or coach_one is null or keeper is null then raise exception 'TEST_STAFF_AND_KEEPER_REQUIRED'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal2')::text,true);
  select * into empty_group from public.create_location_group(9960,'Junior',gen_random_uuid());
  select * into occupied from public.create_location_group(9960,'A',gen_random_uuid());
  insert into public.coach_group_assignments(coach_id,group_id,created_by) values(coach_one,empty_group.id,administrator);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal1')::text,true);
  begin perform public.empty_group_deletion_status(empty_group.id); raise exception 'AAL1_PREVIEW_ALLOWED'; exception when insufficient_privilege then null; end;
  begin perform public.delete_empty_group(empty_group.id); raise exception 'AAL1_DELETION_ALLOWED'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
  begin perform public.empty_group_deletion_status(empty_group.id); raise exception 'COACH_PREVIEW_ALLOWED'; exception when insufficient_privilege then null; end;
  begin perform public.delete_empty_group(empty_group.id); raise exception 'COACH_DELETION_ALLOWED'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal2')::text,true);
  player_id := public.save_player_profile(empty_group.id,null,jsonb_build_object('full_name','Перевірка Порожньої Групи'),null);
  begin perform public.delete_empty_group(empty_group.id); raise exception 'ACTIVE_PLAYER_GROUP_DELETED'; exception when check_violation then if sqlerrm<>'GROUP_HAS_PLAYERS' then raise; end if; end;
  update public.players set is_active=false where id=player_id;
  insert into public.events(group_id,event_type,start_at,duration_minutes,status,coach_id,created_by)
  values(empty_group.id,'training','2001-01-10 12:00:00+02',60,'completed',coach_one,administrator) returning id into past_event;
  insert into public.events(group_id,event_type,start_at,duration_minutes,coach_id,created_by)
  values(empty_group.id,'training','2098-02-10 12:00:00+02',60,coach_one,administrator) returning id into future_event;
  begin perform public.delete_empty_group(empty_group.id); raise exception 'FUTURE_EVENT_GROUP_DELETED'; exception when check_violation then if sqlerrm<>'GROUP_HAS_FUTURE_EVENTS' then raise; end if; end;
  delete from public.events where id=future_event;
  insert into public.club_schedule_slots(weekday,start_time,end_time,group_id) values(1,time '06:00',time '07:00',empty_group.id) returning id into slot_id;
  begin perform public.delete_empty_group(empty_group.id); raise exception 'WEEKLY_SCHEDULE_GROUP_DELETED'; exception when check_violation then if sqlerrm<>'GROUP_HAS_WEEKLY_SCHEDULE' then raise; end if; end;
  delete from public.club_schedule_slots where id=slot_id;
  result := public.delete_empty_group(empty_group.id);
  if result->>'already_deleted'<>'false' then raise exception 'FIRST_DELETION_NOT_CONFIRMED'; end if;
  result := public.delete_empty_group(empty_group.id);
  if result->>'already_deleted'<>'true' then raise exception 'DELETION_NOT_IDEMPOTENT'; end if;
  if not exists(select 1 from public.groups where id=empty_group.id and not is_active)
    or not exists(select 1 from public.players where id=player_id and group_id=empty_group.id)
    or not exists(select 1 from public.events where id=past_event and status='completed') then raise exception 'HISTORY_REMOVED'; end if;
  if (public.empty_group_deletion_status(empty_group.id)->>'is_active')::boolean then raise exception 'STATUS_NOT_UPDATED'; end if;
  if exists(select 1 from public.coach_group_assignments where group_id=empty_group.id and is_active) then raise exception 'ASSIGNMENT_LEFT_ACTIVE'; end if;
  begin update public.players set is_active=true where id=player_id; raise exception 'PLAYER_ADDED_AFTER_GROUP_DELETION'; exception when check_violation then if sqlerrm<>'GROUP_INACTIVE' then raise; end if; end;
  begin insert into public.events(group_id,event_type,start_at,duration_minutes,coach_id,created_by) values(empty_group.id,'training','2098-02-10 12:00:00+02',60,coach_one,administrator); raise exception 'EVENT_ADDED_AFTER_GROUP_DELETION'; exception when check_violation then if sqlerrm<>'GROUP_INACTIVE' then raise; end if; end;
  begin insert into public.club_schedule_slots(weekday,start_time,end_time,group_id) values(1,time '06:00',time '07:00',empty_group.id); raise exception 'SCHEDULE_ADDED_AFTER_GROUP_DELETION'; exception when check_violation then if sqlerrm<>'GROUP_INACTIVE' then raise; end if; end;
  begin update public.coach_group_assignments set is_active=true where group_id=empty_group.id; raise exception 'ASSIGNMENT_REACTIVATED_AFTER_GROUP_DELETION'; exception when check_violation then if sqlerrm<>'GROUP_INACTIVE' then raise; end if; end;
  begin delete from public.groups where id=occupied.id; raise exception 'UNCHECKED_PHYSICAL_DELETE_ALLOWED'; exception when insufficient_privilege then null; end;
  keeper_player := public.save_player_profile(occupied.id,null,jsonb_build_object('full_name','Перевірка Воротаря'),null);
  before_keeper_count := (public.empty_group_deletion_status(keeper)->>'player_count')::integer;
  perform public.set_player_goalkeeper_group(keeper_player,keeper,null);
  if (public.empty_group_deletion_status(keeper)->>'player_count')::integer<>before_keeper_count+1 then raise exception 'SECONDARY_KEEPER_MEMBERSHIP_IGNORED'; end if;
  begin perform public.delete_empty_group(keeper); raise exception 'KEEPER_GROUP_WITH_PLAYERS_DELETED'; exception when check_violation then if sqlerrm<>'GROUP_HAS_PLAYERS' then raise; end if; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
  if private.has_group(empty_group.id) or exists(select 1 from public.groups where id=empty_group.id) then raise exception 'DELETED_GROUP_VISIBLE_TO_COACH'; end if;
  execute 'reset role';
  if (select count(*) from public.audit_log where entity_id=empty_group.id and action='delete_empty_group')<>1 then raise exception 'DELETION_AUDIT_OR_RETRY'; end if;
  if has_function_privilege('anon','public.delete_empty_group(uuid)','execute') then raise exception 'ANON_DELETION_GRANT'; end if;
end;
$test$;
