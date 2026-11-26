-- Run within BEGIN/ROLLBACK. No credentials, Auth users or Storage objects are
-- created. Existing staff identities are used only as transaction-local claims.
do $test$
declare
  administrator uuid;
  coach_one uuid;
  coach_two uuid;
  group_one uuid;
  group_two uuid;
  target_age integer;
  task_one uuid;
  event_one uuid := gen_random_uuid();
  event_custom uuid := gen_random_uuid();
  event_other uuid := gen_random_uuid();
  asset_one uuid := gen_random_uuid();
  asset_custom uuid := gen_random_uuid();
  asset_bad uuid := gen_random_uuid();
  location_group public.groups%rowtype;
  location_task uuid;
  location_event uuid := gen_random_uuid();
  location_asset uuid := gen_random_uuid();
  keeper_coach uuid;
  keeper_group uuid;
  keeper_event uuid := gen_random_uuid();
  keeper_asset uuid := gen_random_uuid();
begin
  select id into administrator from public.profiles where role='admin' and status='active' order by id limit 1;
  select a.coach_id,a.group_id,coalesce(g.display_age,g.age) into coach_one,group_one,target_age
  from public.coach_group_assignments a join public.groups g on g.id=a.group_id join public.profiles p on p.id=a.coach_id
  where a.is_active and g.is_active and g.group_kind='age' and p.status='active' and p.role='coach'
  order by a.coach_id,a.group_id limit 1;
    select a.coach_id,a.group_id into coach_two,group_two from public.coach_group_assignments a
    join public.profiles p on p.id=a.coach_id join public.groups g on g.id=a.group_id
    where a.is_active and p.status='active' and p.role='coach' and g.is_active and a.coach_id<>coach_one
      and not exists(select 1 from public.coach_group_assignments b where b.coach_id=coach_one and b.group_id=a.group_id and b.is_active)
      and not exists(select 1 from public.coach_group_assignments b where b.coach_id=a.coach_id and b.group_id=group_one and b.is_active)
    order by a.coach_id,a.group_id limit 1;
  select id into task_one from public.methodology_tasks where is_active and target_age between age_from and age_to order by id limit 1;
  select id into location_task from public.methodology_tasks where is_active and age_from between 6 and 8 order by age_from,id limit 1;
  if administrator is null or coach_one is null or group_two is null or task_one is null or location_task is null then raise exception 'TEST_STAFF_AND_TASKS_REQUIRED'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
  insert into public.events(id,group_id,event_type,start_at,duration_minutes,coach_id,created_by,task_id,title) values
    (event_one,group_one,'training','2098-01-04T10:00:00Z',60,coach_one,coach_one,task_one,'Document test'),
    (event_custom,group_one,'training','2098-01-05T10:00:00Z',60,coach_one,coach_one,null,'Custom document test'),
    (event_other,group_one,'theory','2098-01-06T10:00:00Z',60,coach_one,coach_one,null,'Non-training document test');
  execute 'set local role authenticated';
  insert into public.file_assets(id,owner_id,bucket,object_path,original_name,mime_type,size_bytes,context_type,context_group_id,context_age)
  values (asset_one,coach_one,'task-documents',coach_one||'/'||asset_one||'.pdf','test.pdf','application/pdf',100,'event_task_material',group_one,target_age);
  if not exists(select 1 from public.file_assets where id=asset_one and scan_status='pending') then raise exception 'REGISTERED_FILE_NOT_READABLE'; end if;
  begin
    perform public.attach_event_task_material(event_one,task_one,asset_one);
    raise exception 'PENDING_FILE_ATTACHED';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  update public.file_assets set scan_status='clean' where id=asset_one;
  insert into public.file_assets(id,owner_id,bucket,object_path,original_name,mime_type,size_bytes,scan_status,context_type,context_group_id,context_age)
  values
    (asset_custom,coach_one,'task-documents',coach_one||'/'||asset_custom||'.pdf','custom.pdf','application/pdf',100,'clean','event_task_material',group_one,target_age),
    (asset_bad,coach_two,'task-documents',coach_two||'/'||asset_bad||'.pdf','other-owner.pdf','application/pdf',100,'clean','event_task_material',group_one,target_age);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  perform public.attach_event_task_material(event_one,task_one,asset_one);
  perform public.attach_event_task_material(event_one,task_one,asset_one);
  if (select count(*) from public.event_materials where event_id=event_one and file_asset_id=asset_one)<>1 then raise exception 'TASK_LINK_NOT_IDEMPOTENT'; end if;
  if not exists(select 1 from public.methodology_materials where task_id=task_one and file_asset_id=asset_one) then raise exception 'SHARED_TASK_MATERIAL_MISSING'; end if;
  perform public.attach_event_material(event_custom,asset_custom);
  if not exists(select 1 from public.event_materials where event_id=event_custom and file_asset_id=asset_custom) then raise exception 'CUSTOM_TASK_MATERIAL_MISSING'; end if;
  begin
    perform public.attach_event_material(event_custom,asset_bad);
    raise exception 'ANOTHER_OWNERS_FILE_ATTACHED';
  exception when insufficient_privilege then null; end;
  begin
    perform public.attach_event_material(event_other,asset_custom);
    raise exception 'NON_TRAINING_FILE_ATTACHED';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_two,'role','authenticated','aal','aal1')::text,true);
  begin
    perform public.attach_event_material(event_custom,asset_bad);
    raise exception 'UNASSIGNED_COACH_ATTACHED';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
  -- A new SQL statement and re-established role see the persisted links.
  execute 'reset role'; execute 'set local role authenticated';
  if not exists(select 1 from public.event_materials em join public.file_assets f on f.id=em.file_asset_id where em.event_id=event_one and f.scan_status='clean') then raise exception 'REOPENED_MATERIAL_MISSING'; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',administrator,'role','authenticated','aal','aal2')::text,true);
  select * into location_group from public.create_location_group(9890,'A',gen_random_uuid());
  insert into public.coach_group_assignments(coach_id,group_id,created_by) values(coach_one,location_group.id,administrator);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
  insert into public.events(id,group_id,event_type,start_at,duration_minutes,coach_id,created_by,task_id)
  values(location_event,location_group.id,'training','2098-01-07T10:00:00Z',60,coach_one,coach_one,location_task);
  execute 'set local role authenticated';
  insert into public.file_assets(id,owner_id,bucket,object_path,original_name,mime_type,size_bytes,context_type,context_group_id,context_age)
  select location_asset,coach_one,'task-documents',coach_one||'/'||location_asset||'.pdf','location.pdf','application/pdf',100,'event_task_material',location_group.id,age_from from public.methodology_tasks where id=location_task;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  update public.file_assets set scan_status='clean' where id=location_asset;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',coach_one,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  perform public.attach_event_task_material(location_event,location_task,location_asset);
  if not exists(select 1 from public.event_materials where event_id=location_event and file_asset_id=location_asset) then raise exception 'LOCATION_MATERIAL_MISSING'; end if;
  execute 'reset role';
  if has_function_privilege('anon','public.attach_event_material(uuid,uuid)','execute') then raise exception 'ANON_ATTACHMENT_ACCESS'; end if;

  select a.coach_id,a.group_id into keeper_coach,keeper_group from public.coach_group_assignments a
  join public.groups g on g.id=a.group_id join public.profiles p on p.id=a.coach_id
  where a.is_active and g.is_active and g.group_kind='goalkeeper' and p.status='active' and p.role='coach'
  order by a.coach_id,a.group_id limit 1;
  if keeper_group is null then raise exception 'TEST_KEEPER_ASSIGNMENT_REQUIRED'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',keeper_coach,'role','authenticated','aal','aal1')::text,true);
  insert into public.events(id,group_id,event_type,start_at,duration_minutes,coach_id,created_by,title)
  values(keeper_event,keeper_group,'training','2098-01-08T10:00:00Z',60,keeper_coach,keeper_coach,'Keeper document test');
  execute 'set local role authenticated';
  insert into public.file_assets(id,owner_id,bucket,object_path,original_name,mime_type,size_bytes,context_type,context_group_id,context_age)
  values(keeper_asset,keeper_coach,'task-documents',keeper_coach||'/'||keeper_asset||'.pdf','keeper.pdf','application/pdf',100,'event_task_material',keeper_group,null);
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  update public.file_assets set scan_status='clean' where id=keeper_asset;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',keeper_coach,'role','authenticated','aal','aal1')::text,true);
  execute 'set local role authenticated';
  perform public.attach_event_material(keeper_event,keeper_asset);
  if not exists(select 1 from public.event_materials where event_id=keeper_event and file_asset_id=keeper_asset) then raise exception 'KEEPER_MATERIAL_MISSING'; end if;
  execute 'reset role';
end;
$test$;
