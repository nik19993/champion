// Isolated PostgreSQL/WASM contract test. Never connects to Supabase or a network DB.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.argv[2];
const { PGlite } = modulePath ? await import(pathToFileURL(modulePath).href) : await import('@electric-sql/pglite');
const db = new PGlite();
const admin='00000000-0000-4000-8000-000000000001',coach='00000000-0000-4000-8000-000000000002';
let checks=0;
async function identity(id,aal='aal1',role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);
  await db.exec(`set role ${role}`);
}
async function reject(sql,params=[],message) {
  await assert.rejects(db.query(sql,params),message ? new RegExp(message) : undefined);checks++;
}
async function scalar(sql,params=[]) { return (await db.query(sql,params)).rows[0].value; }
try {
 await db.exec(await readFile(new URL('../tests/proposal-baseline.sql',import.meta.url),'utf8'));
 const proposals=await readdir(new URL('../supabase/proposals/',import.meta.url));
 // Age/material integration needs the full historical schema and has its own fixture.
 for(const file of proposals.filter(name=>name.endsWith('.sql') && !name.endsWith('_venue_half_bookings.sql') && !name.endsWith('_training_register_completion.sql') && !name.endsWith('_season_effective_age_access.sql') && !name.endsWith('_club_cards.sql') && !name.endsWith('_bulk_content_management.sql')).sort()) await db.exec(await readFile(new URL(`../supabase/proposals/${file}`,import.meta.url),'utf8'));
 await db.query('insert into profiles values($1,\'admin\',\'active\'),($2,\'coach\',\'active\')',[admin,coach]);
 const groups=[];
 for(let age=6;age<=17;age++) for(const suffix of age<8?['']:['A','B']) {
   const {rows}=await db.query("insert into groups(code,age,team_suffix,group_kind) values($1,$2,$3,'age') returning id,code,age",[`U${age}${suffix}`,age,suffix||null]); groups.push(rows[0]);
 }
 await db.exec("insert into groups(code,team_suffix,group_kind) values('Воротарі A','A','goalkeeper')");
 const group=groups.find(row=>row.code==='U11A'),other=groups.find(row=>row.code==='U11B');
 await db.query('insert into coach_group_assignments(coach_id,group_id) values($1,$2)',[coach,group.id]);
 const cohorts=Object.fromEntries(groups.map(g=>[g.id,2027-g.age]));
 await identity(coach);await reject('select initialize_club_season(2026,$1::jsonb)',[cohorts],'MFA');
 await identity(admin);await reject('select initialize_club_season(2026,$1::jsonb)',[cohorts],'MFA');
 await identity(admin,'aal2');
 await reject('select initialize_club_season(2026,$1::jsonb)',[{...cohorts,[group.id]:2015}],'COHORT');
 await db.exec('reset role');assert.equal(await scalar('select count(*)::integer as value from club_season_settings'),0);checks++;
 await identity(admin,'aal2');await db.query('select initialize_club_season(2026,$1::jsonb)',[cohorts]);
 await reject('select initialize_club_season(2026,$1::jsonb)',[cohorts],'ALREADY_INITIALIZED');
 await identity(coach);await reject('select advance_club_season(2026,2027)',[],'MFA');
 await identity(admin,'aal2');await db.query('select advance_club_season(2026,2027)');
 await reject('select advance_club_season(2026,2027)',[],'SEASON_CHANGED');
 await reject('select advance_club_season(2027,2027)',[],'ONLY_NEXT');
 await db.exec('reset role');
 let changed=(await db.query('select * from groups where id=$1',[group.id])).rows[0];
 assert.equal(changed.display_code,'U12A');assert.equal(changed.cohort_birth_year,2016);assert.equal(changed.code,'U11A');assert.equal(changed.age,11);checks+=4;
 assert.equal(await scalar('select count(*)::integer as value from group_season_history'),groups.length*2);checks++;
 assert.equal(await scalar("select display_code as value from groups where code='Воротарі A'"),null);checks++;
 assert.equal(await scalar("select display_code as value from groups where code='U17A'"),'U18A');checks++;
 await identity(coach);
 const values={full_name:'Тестовий Гравець',birth_year:'2016',birth_date:'2016-02-29',position:'',dominant_foot:''};
 const playerId=await scalar('select save_player_profile($1,null,$2::jsonb,null) as value',[group.id,values]);checks++;
 await reject('select save_player_profile($1,null,$2::jsonb,null)',[other.id,values],'access');
 await reject('select save_player_profile($1,$2,$3::jsonb,null)',[group.id,playerId,values],'CHANGED');
 await db.exec('reset role');
 let stamp=await scalar('select updated_at::text as value from players where id=$1',[playerId]);
 await identity(coach);await db.query('select save_player_profile($1,$2,$3::jsonb,$4)',[group.id,playerId,{...values,position:'Воротар'},stamp]);checks++;
 const guardianId=await scalar('select save_player_guardian($1,null,$2::jsonb) as value',[playerId,{phone:'+380000000001',full_name:'Тестовий контакт'}]);
 await db.query('select save_player_guardian($1,$2,$3::jsonb)',[playerId,guardianId,{phone:'+380000000002',full_name:'Тестовий контакт'}]);checks++;
 await db.exec('reset role');assert.equal(await scalar('select count(*)::integer as value from guardians where player_id=$1',[playerId]),1);checks++;
 async function importJob(dataset,payloads) {
   await db.exec('reset role');const id=await scalar('select gen_random_uuid() as value');
   await db.query("insert into import_jobs(id,dataset,status,total_rows,created_by) values($1,$2,'previewed',$3,$4)",[id,dataset,payloads.length,admin]);
   for(let i=0;i<payloads.length;i++) await db.query("insert into import_rows values($1,$2,$3,true,'{}')",[id,i+1,payloads[i]]);
   await identity(admin,'aal2');await db.query('select confirm_import_job($1)',[id]);checks++;
 }
 await importJob('players',[{group:'U12A',full_name:values.full_name,birth_year:'2016',position:'Воротар'}]);
 await importJob('players',[{group:'U12A',full_name:values.full_name,birth_year:'',position:''}]);
 await db.exec('reset role');assert.equal(await scalar('select count(*)::integer as value from players'),1);assert.equal(await scalar('select position as value from players where id=$1',[playerId]),'Воротар');checks+=2;
 const test={group:'U12A',player:values.full_name,date:'2026-10-09',metric:'Тест',field:'Час',value:'5.1'};
 await importJob('physical_tests',[test,{...test,value:'—',player:'Без результату'}]);
 await importJob('physical_tests',[test]);
 await importJob('physical_tests',[{...test,date:'2027-04-09',value:'4.9'}]);
 await assert.rejects(importJob('physical_tests',[{...test,value:'9.9'}]),/conflict/);checks++;
 await assert.rejects(importJob('players',[{group:'U12A',full_name:'Новий Тестовий Гравець',birth_year:'2016'},{group:'U12A',full_name:values.full_name,position:'Інше амплуа'}]),/conflict/);checks++;
 await db.exec('reset role');assert.equal(await scalar('select count(*)::integer as value from players'),1);checks++;
 assert.equal(await scalar('select count(*)::integer as value from physical_test_results'),2);assert.equal(await scalar('select count(*)::integer as value from physical_test_sessions'),2);checks+=2;
 stamp=await scalar('select updated_at::text as value from players where id=$1',[playerId]);
 await identity(coach);await db.query('select archive_player($1,$2)',[playerId,stamp]);
 await db.exec('reset role');assert.equal(await scalar('select is_active as value from players where id=$1',[playerId]),false);assert.equal(await scalar('select count(*)::integer as value from physical_test_results where player_id=$1',[playerId]),2);checks+=2;
 await identity(coach,'aal1','anon');await reject('select advance_club_season(2027,2028)',[],'permission denied');
 await identity(coach);await reject('update club_season_settings set start_year=2028',[],'permission denied');
 await db.exec('reset role');await db.query("update profiles set status='suspended' where id=$1",[coach]);
 await identity(coach);await reject('select save_player_profile($1,null,$2::jsonb,null)',[group.id,values],'access');
 console.log(`PASS: ${checks} isolated PostgreSQL contract checks; no external DB used.`);
} finally {await db.close();}
