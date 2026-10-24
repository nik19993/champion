// Isolated synthetic full-schema integration; never connects to Supabase.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import ts from "typescript";
import { APPLICATION_BACKUP_TABLES } from "../lib/domain/application-backup.ts";
const modulePath = process.argv[2];
const { PGlite } = modulePath ? await import(pathToFileURL(modulePath).href) : await import("@electric-sql/pglite");
const { btree_gist } = modulePath ? await import(pathToFileURL(path.join(path.dirname(modulePath), "contrib/btree_gist.js")).href) : await import("@electric-sql/pglite/contrib/btree_gist");
const root=fileURLToPath(new URL("../",import.meta.url));
// Exactly the reconciled historical source files. Never use db push on these
// legacy filenames: the applied ledger includes different timestamps.
const historicalFiles=[
  "20260917154528_foundation_0_2_2.sql",
  "20260917154737_working_modules_schema_0_2_2.sql",
  "20260917154826_working_access_helpers_0_2_2.sql",
  "20260917154843_working_business_triggers_0_2_2.sql",
  "20260917154917_working_file_validation_trigger_0_2_2.sql",
  "20260917154932_working_audit_helper_0_2_2.sql",
  "20260917155511_working_file_read_helper_0_2_2_hotfix.sql",
  "20260917155528_working_storage_read_helper_0_2_2.sql",
  "20260917155555_working_atomic_workflows_0_2_2.sql",
  "20260917155612_working_admin_workflows_0_2_2.sql",
  "20260917155631_working_function_grants_triggers_0_2_2.sql",
  "20260917155702_working_rls_policies_0_2_2.sql",
  "20260917155725_working_data_api_grants_0_2_2.sql",
  "20260917155740_working_private_storage_0_2_2.sql",
  "20260917155756_goalkeeper_groups_0_2_2.sql",
  "20260917160515_payment_audit_actor_hotfix.sql",
  "20260917161057_file_access_helper_grant_hotfix.sql",
  "20260917161812_staging_security_hardening.sql",
  "20260918064008_glossary_term_category_key.sql",
  "20260918121638_evaluation_metric_catalogs.sql",
  "20260918121843_evaluation_metric_fk_indexes.sql",
  "20260919083847_import_results_group_scope.sql",
  "20260919140000_goalkeeper_announcements_methodology_library.sql",
  "20260919173000_evaluation_metric_age_bands.sql",
  "20260920090000_physical_test_components.sql",
  "20260926195000_monthly_star_program.sql",
  "20260926195500_monthly_star_void_security.sql",
  "20260926200500_monthly_star_award_rpc.sql",
  "20260926203000_coach_deletion_history.sql",
  "20260926204000_monthly_star_generated_month_guard.sql",
  "20260927103625_extend_groups_and_player_characteristics.sql",
  "20260927194151_coach_photo_attendance_card_scope.sql",
  "20260928092916_coach_photo_and_training_card_rules.sql",
  "20260928093957_qualify_behavior_card_policy_scope.sql",
  "20260928172946_register_player_photo_asset.sql",
  "20260928184744_remove_forward_pass_test_metric.sql"
];
const db=new PGlite({extensions:{btree_gist}});
let checks=0;
try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage; create schema extensions;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
 alter table storage.objects enable row level security;
 create function storage.foldername(n text) returns text[] language sql immutable as $$select (string_to_array(n,'/'))[1:array_length(string_to_array(n,'/'),1)-1]$$;
 `);
 for (const name of historicalFiles) {
  await db.exec(await fs.readFile(path.join(root,"supabase/migrations",name),"utf8"));
 }
 const before=await db.query("select count(*)::int as tables from pg_tables where schemaname='public'");
 assert.equal(before.rows[0].tables,43);checks++;
 const proposals=(await fs.readdir(path.join(root,"supabase/proposals"))).filter(f=>f.endsWith(".sql")).sort();
 for(const name of proposals){console.log("PROPOSAL",name);await db.exec(await fs.readFile(path.join(root,"supabase/proposals",name),"utf8"));}
 const releaseMigrations=(await fs.readdir(path.join(root,"supabase/migrations"))).filter(f=>/^20261024.*\.sql$/.test(f)).sort();
 for(const name of releaseMigrations){console.log("RELEASE MIGRATION",name);await db.exec(await fs.readFile(path.join(root,"supabase/migrations",name),"utf8"));}
 const after=await db.query("select count(*)::int as tables from pg_tables where schemaname='public'");
 assert.equal(after.rows[0].tables,47);checks++;
 const rls=await db.query("select count(*)::int as disabled from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity");
 assert.equal(rls.rows[0].disabled,0);checks++;
 const rows=(await db.query("select table_name,column_name,is_nullable,udt_name from information_schema.columns where table_schema='public' order by table_name,ordinal_position")).rows;

 // Verify every application table/column and backup primary-key definition.
 const source=ts.createSourceFile("database.types.ts",await fs.readFile(path.join(root,"lib/supabase/database.types.ts"),"utf8"),ts.ScriptTarget.Latest,true);
 const alias=source.statements.find(node=>ts.isTypeAliasDeclaration(node)&&node.name.text==="Database");
 const member=(node,name)=>node.members.find(item=>item.name?.getText(source).replaceAll('"','')===name).type;
 const schema=member(alias.type,"public"),tables=member(schema,"Tables");
 const realTables=(await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map(row=>row.tablename);
 assert.deepEqual(tables.members.map(item=>item.name.text).sort(),realTables);checks++;
 assert.deepEqual(APPLICATION_BACKUP_TABLES.map(item=>item.name).sort(),realTables);checks++;
 for(const table of tables.members) {
   const rowType=member(table.type,"Row"),insertType=member(table.type,"Insert"),updateType=member(table.type,"Update");
   const columns=rows.filter(row=>row.table_name===table.name.text);
   assert.deepEqual(rowType.members.map(item=>item.name.text).sort(),columns.map(item=>item.column_name).sort());checks++;
   for(const column of columns) {
     const row=rowType.members.find(item=>item.name.text===column.column_name);
     const nullable=/\bnull\b/.test(row.type.getText(source));
     assert.equal(nullable,column.is_nullable==="YES",`${table.name.text}.${column.column_name} nullable`);checks++;
     assert.ok(insertType.members.some(item=>item.name.text===column.column_name));
     assert.ok(updateType.members.some(item=>item.name.text===column.column_name&&item.questionToken));checks+=2;
   }
 }
 const primaryKeys=(await db.query("select c.table_name,k.column_name,k.ordinal_position from information_schema.table_constraints c join information_schema.key_column_usage k on k.constraint_name=c.constraint_name and k.table_schema=c.table_schema and k.table_name=c.table_name where c.table_schema='public' and c.constraint_type='PRIMARY KEY' order by c.table_name,k.ordinal_position")).rows;
 for(const table of APPLICATION_BACKUP_TABLES) { assert.deepEqual([...table.key],primaryKeys.filter(row=>row.table_name===table.name).map(row=>row.column_name),table.name);checks++; }
 const functions=member(schema,"Functions");
 const realFunctions=(await db.query("select p.proname as name,p.proargnames as names,p.pronargs,p.pronargdefaults from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prorettype<>'trigger'::regtype")).rows;
 assert.deepEqual(functions.members.map(item=>item.name.text).sort(),realFunctions.map(item=>item.name).sort());checks++;
 for(const fn of realFunctions) {
   const args=member(functions.members.find(item=>item.name.text===fn.name).type,"Args");
   assert.deepEqual(ts.isTypeLiteralNode(args)?args.members.map(item=>item.name.text).sort():[],(fn.names??[]).slice(0,fn.pronargs).sort(),fn.name);checks++;
 }
 console.log(`PASS: 36 historical migrations + ${proposals.length} proposals + ${releaseMigrations.length} release migrations; 47 RLS tables; types/backup schema checks (${checks}). Synthetic Auth/storage only; this is not a full recovery restore.`);

 const coach="00000000-0000-4000-8000-000000000011",admin="00000000-0000-4000-8000-000000000012";
 const scalar=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
 const identity=async(id,aal="aal1") => {await db.exec("reset role");await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);await db.exec("set role authenticated");};
 const test=(actual,expected) => {assert.deepEqual(actual,expected);checks++;};
 await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'synthetic-coach@example.test','{\"full_name\":\"Тестовий тренер\"}'),($2,'synthetic-admin@example.test','{\"full_name\":\"Тестовий адміністратор\"}')",[coach,admin]);
 await db.query("update profiles set status='active',role=case when id=$1 then 'admin'::app_role else 'coach'::app_role end,must_change_password=false where id in($1,$2)",[admin,coach]);
 await db.exec("insert into groups(code,age,team_suffix,group_kind) values('U11A',11,'A','age'),('U11B',11,'B','age') on conflict(code) do nothing");
 const group=await scalar("select id as value from groups where code='U11A'"),other=await scalar("select id as value from groups where code='U11B'");
 await db.query("insert into coach_group_assignments(coach_id,group_id) values($1,$2)",[coach,group]);
 const cohorts=Object.fromEntries((await db.query("select id,age from groups where is_active and group_kind='age'")).rows.map(g=>[g.id,2027-g.age]));
 await identity(admin,"aal2"); await db.query("select initialize_club_season(2026,$1)",[cohorts]);test(await scalar("select start_year as value from club_season_settings"),2026);
 await identity(coach);
 const p1=await scalar("select save_player_profile($1,null,$2,null) as value",[group,{full_name:"Тестовий Гравець А",birth_date:"2016-02-29",birth_year:"2016",position:"Воротар",dominant_foot:"Права"}]);
 const p2=await scalar("select save_player_profile($1,null,$2,null) as value",[group,{full_name:"Тестовий Гравець Б",birth_year:"2016"}]);test(Boolean(p1&&p2),true);
 await assert.rejects(db.query("select save_player_profile($1,null,$2,null)",[other,{full_name:"Недоступний Гравець"}]),/Group access/);checks++;
 await db.query("select save_player_guardian($1,null,$2)",[p1,{phone:"+380000000000"}]);test(await scalar("select count(*)::int as value from guardians where player_id=$1",[p1]),1);
 await db.exec("reset role");
 const venue=await scalar("insert into venues(name,venue_type) values('Ізольоване тестове поле','field') returning id as value");
 await identity(coach);
 const event=await scalar("insert into events(group_id,event_type,start_at,duration_minutes,venue_id,venue_part,coach_id,created_by,title) values($1,'training','2000-01-01T12:00:00Z',60,$2,'left',$3,$3,'Тестове тренування') returning id as value",[group,venue,coach]);
 const initialRecords=[{player_id:p1,status:"present"},{player_id:p2,status:"absent"}];
 await db.query("select save_attendance($1,gen_random_uuid(),now(),$2)",[event,initialRecords]);
 const card=await scalar("insert into player_behavior_cards(player_id,group_id,coach_id,event_id,occurred_on,reason) values($1,$2,$3,$4,'2000-01-01','late') returning id as value",[p1,group,coach,event]);test(Boolean(card),true);
 const version=await scalar("select server_version as value from attendance_sessions where event_id=$1",[event]);
 const records=await scalar("select jsonb_agg(jsonb_build_object('player_id',r.player_id,'status',r.status,'note',r.note)) as value from attendance_records r join attendance_sessions s on s.id=r.session_id where s.event_id=$1",[event]);
 const completion=await scalar("select complete_training_register($1,$2,$3,$4) as value",[event,version,[card],records]);test(completion.player_count,2);test(completion.card_count,1);
 test(await scalar("select status::text as value from events where id=$1",[event]),"scheduled");test(await scalar("select booking_part as value from events where id=$1",[event]),"left");
 const stamp=await scalar("select updated_at::text as value from players where id=$1",[p2]);
 await db.query("select archive_player($1,$2)",[p2,stamp]);
 await db.query("select save_attendance($1,gen_random_uuid(),now(),$2)",[event,[{player_id:p1,status:"present"}]]);
 test(await scalar("select count(*)::int as value from attendance_records r join attendance_sessions s on s.id=r.session_id where s.event_id=$1",[event]),2);
 test(await scalar("select completed_at is null as value from training_register_completions where event_id=$1",[event]),true);
 await identity(admin,"aal2");await db.query("select advance_club_season(2026,2027)");
 test(await scalar("select display_code as value from groups where id=$1",[group]),"U12A");test(await scalar("select cohort_birth_year::int as value from groups where id=$1",[group]),2016);
 await identity(coach);
 test(await scalar("select private.has_assigned_age(11) as value"),false);
 test(await scalar("select private.has_assigned_age(12) as value"),true);

 // Current curriculum and material writes follow the explicit season; old
 // event-attached material remains readable through its historical group.
 const owner=async()=>{await db.exec("reset role");await db.query("select set_config('request.jwt.claims','{}',false)");};
 const denied=async(sql,args=[])=>{await assert.rejects(db.query(sql,args),error=>error.code==='42501');checks++;};
 await owner();
 const oldTask=await scalar("insert into methodology_tasks(title,phase,level,age_from,age_to) values('Стара програма','attack','individual',11,11) returning id as value");
 const newTask=await scalar("insert into methodology_tasks(title,phase,level,age_from,age_to) values('Поточна програма','attack','individual',12,12) returning id as value");
 const oldFile=await scalar("insert into file_assets(owner_id,bucket,object_path,original_name,mime_type,size_bytes,scan_status,context_type,context_age) values($1,'task-documents','synthetic/historical.pdf','historical.pdf','application/pdf',10,'clean','event_task',11) returning id as value",[admin]);
 await db.query("insert into event_materials(event_id,file_asset_id,source_type,actor_id) values($1,$2,'admin',$3)",[event,oldFile,admin]);
 await db.query("update events set task_id=$1 where id=$2",[newTask,event]);
 await identity(coach);
 test(await scalar("select count(*)::int as value from methodology_tasks where id=$1",[newTask]),1);
 test(await scalar("select count(*)::int as value from methodology_tasks where id=$1",[oldTask]),0);
 test(await scalar("select count(*)::int as value from file_assets where id=$1",[oldFile]),1);
 const fileSql="insert into file_assets(owner_id,bucket,object_path,original_name,mime_type,size_bytes,context_type,context_group_id,context_age) values($1,'task-documents',$2,'test.pdf','application/pdf',10,'event_task',$3,$4) returning id as value";
 await denied(fileSql,[coach,'synthetic/old-age.pdf',group,11]);
 await denied(fileSql,[coach,'synthetic/foreign-group.pdf',other,12]);
 const newFile=await scalar("select gen_random_uuid() as value");
 await db.query(fileSql.replace('insert into file_assets(owner_id','insert into file_assets(id,owner_id').replace('values($1,','values($5,$1,').replace(' returning id as value',''),[coach,'synthetic/current-age.pdf',group,12,newFile]);
 test(await scalar("select count(*)::int as value from file_assets where id=$1",[newFile]),1);
 await denied("select attach_event_task_material($1,$2,$3)",[event,newTask,newFile]);
 await owner();await db.query("update file_assets set scan_status='clean' where id=$1",[newFile]);
 await identity(coach);await db.query("select attach_event_task_material($1,$2,$3)",[event,newTask,newFile]);
 test(await scalar("select age_from::int as value from methodology_materials where file_asset_id=$1",[newFile]),12);
 await denied("select attach_event_task_material($1,$2,$3)",[event,oldTask,newFile]);
 test(await scalar("select group_code as value from venue_booking_conflicts($1,'2000-01-01T12:00:00Z',60)",[venue]),"U12A");
 await assert.rejects(db.query("insert into events(group_id,event_type,start_at,duration_minutes,venue_id,venue_part,coach_id,created_by) values($1,'training','2000-01-01T12:00:00Z',60,$2,'whole',$3,$3)",[group,venue,coach]),error=>error.code==='23P01' && /U12A/.test(error.message));checks++;
 await identity(admin);await denied("select advance_club_season(2027,2028)");
 await identity(admin,'aal2');await db.query("select advance_club_season(2027,2028)");
 await identity(coach);test(await scalar("select private.has_assigned_age(12) as value"),false);test(await scalar("select private.has_assigned_age(13) as value"),true);
 test(await scalar("select count(*)::int as value from file_assets where id in($1,$2)",[oldFile,newFile]),2);
 test(await scalar("select count(*)::int as value from group_season_history where group_id=$1",[group]),3);
 await owner();
 const goalkeeper=await scalar("select id as value from groups where group_kind='goalkeeper' order by code limit 1");
 await db.query("insert into coach_group_assignments(coach_id,group_id) values($1,$2)",[coach,goalkeeper]);
 await identity(coach);await db.query(fileSql.replace(' returning id as value',''),[coach,'synthetic/keeper.pdf',goalkeeper,null]);
 test(await scalar("select count(*)::int as value from file_assets where object_path='synthetic/keeper.pdf'"),1);
 test(await scalar("select display_age as value from groups where id=$1",[goalkeeper]),null);
 await owner();await db.query("update coach_group_assignments set is_active=false where coach_id=$1",[coach]);
 await identity(coach);test(await scalar("select private.has_assigned_age(13) as value"),false);await denied(fileSql,[coach,'synthetic/inactive-assignment.pdf',group,13]);
 await owner();await db.query("update coach_group_assignments set is_active=true where coach_id=$1",[coach]);await db.query("update profiles set status='suspended' where id=$1",[coach]);
 await identity(coach);test(await scalar("select private.has_assigned_age(13) as value"),false);await denied("select attach_event_task_material($1,$2,$3)",[event,newTask,newFile]);
 await owner();await db.query("update profiles set status='active' where id=$1",[coach]);
 await db.exec("set role anon");await denied("select attach_event_task_material($1,$2,$3)",[event,newTask,newFile]);

 await db.exec("reset role");await db.query("delete from auth.users where id=$1",[coach]);
 test(await scalar("select count(*)::int as value from profiles where id=$1",[coach]),1);
 test(await scalar("select count(*)::int as value from player_behavior_cards where event_id=$1",[event]),1);
 test(await scalar("select count(*)::int as value from attendance_records r join attendance_sessions s on s.id=r.session_id where s.event_id=$1",[event]),2);
 // Apply the exact release content on the synthetic historical database.
 let privateContent;
 try { privateContent=await fs.readFile(path.join(root,"release/2026-10-24/approved_curriculum.sql"),"utf8"); }
 catch(error) { if(error.code!=="ENOENT")throw error; console.log("SKIP private curriculum content: not included in public repository."); }
 if(privateContent) {
 const historyBefore=await scalar("select count(*)::int as value from events");
 await db.exec(privateContent);
 test(await scalar("select count(*)::int as value from methodology_tasks where is_active"),349);
 test(await scalar("select count(*)::int as value from methodology_tasks where is_active and context='standard'"),64);
 test(await scalar("select count(*)::int as value from events"),historyBefore);
 test(await scalar("select count(*)::int as value from methodology_tasks where id in($1,$2)",[oldTask,newTask]),2);
 test(await scalar("select count(*)::int as value from attendance_records r join attendance_sessions s on s.id=r.session_id where s.event_id=$1",[event]),2);
 }
 console.log("PASS full-schema functional checks:",checks,"assertions with synthetic users; real Auth service and concurrent PostgreSQL sessions are not covered.");
}catch(e){console.error("REHEARSAL FAILED after",checks,"checks:",e.message,e.code);process.exitCode=1;}finally{await db.close();}
