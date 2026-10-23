// Isolated SQL fixture validation. Never connects to an external project.
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import assert from 'node:assert/strict';
const modulePath=process.argv[2];if(!modulePath)throw Error('Pass the local PGlite module path.');
const {PGlite}=await import(pathToFileURL(modulePath).href);
const {btree_gist}=await import(pathToFileURL(join(dirname(modulePath),'contrib/btree_gist.js')).href);
import {readFile,readdir} from 'node:fs/promises';
import {historicalFiles,reviewBootstrap} from './lib/review-schema.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const db=new PGlite({extensions:{btree_gist}});
try{await db.exec(reviewBootstrap);for(const f of historicalFiles)await db.exec(await readFile(root+'/supabase/migrations/'+f,'utf8'));for(const f of (await readdir(root+'/supabase/proposals')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(root+'/supabase/proposals/'+f,'utf8'));
for(let i=1;i<=3;i++)await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",['f0000000-0000-4000-8000-00000000000'+i,'fixture'+i+'@example.test',{full_name:'Тестовий профіль '+i}]);
await db.exec("update profiles set status='active',must_change_password=false; update profiles set role='admin' where id='f0000000-0000-4000-8000-000000000001'");
await db.exec(await readFile(root+'/testing/full-test-data.sql','utf8'));
const counts=(await db.query("select (select count(*) from groups) as groups,(select count(*) from players) as players,(select count(*) from events) as events,(select count(*) from physical_test_results) as physical_results,(select count(*) from game_activity_results) as game_results")).rows[0];
assert.deepEqual(counts,{groups:25,players:72,events:4,physical_results:45,game_results:27});
console.log("PASS synthetic full-test data:",JSON.stringify(counts));

// Real SQL/RLS regression for the already-approved calendar cancellation path.
const coach='f0000000-0000-4000-8000-000000000002';
async function identity(id,aal='aal1') {await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);await db.exec('set role authenticated');}
await identity(coach);
const event='71000000-0000-4000-8000-000000000003';
const players=(await db.query("select id from players where group_id=(select group_id from events where id=$1) and is_active",[event])).rows;
const records=players.map(p=>({player_id:p.id,status:'present',note:null}));
await db.query("select save_attendance($1,'f1000000-0000-4000-8000-000000000001',now(),$2::jsonb)",[event,JSON.stringify(records)]);
await assert.rejects(db.query("update events set status='completed' where id=$1",[event]),/administrative event fields/);
assert.equal((await db.query("update events set status='cancelled' where id='71000000-0000-4000-8000-000000000002' returning id")).rows.length,0);
assert.equal((await db.query("update events set status='cancelled' where id=$1 returning id",[event])).rows.length,1);
assert.equal((await db.query("select count(*)::int n from attendance_records where session_id=(select id from attendance_sessions where event_id=$1)",[event])).rows[0].n,3);
await assert.rejects(db.query("update events set status='scheduled' where id=$1",[event]),/administrative event fields/);
await assert.rejects(db.query("delete from events where id=$1",[event]),/присутністю/);
await identity('f0000000-0000-4000-8000-000000000001','aal2');
assert.equal((await db.query("update events set status='completed' where id=$1 returning id",[event])).rows.length,1);
console.log('PASS: 7 SQL/RLS calendar cancellation regressions; attendance history retained.');

}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,detail:error.detail,where:error.where}));process.exitCode=1;}finally{await db.close();}
