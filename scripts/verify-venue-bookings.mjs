// Offline PostgreSQL/WASM test. Never uses Supabase credentials or a network DB.
// Pass .../@electric-sql/pglite/dist/index.js; btree_gist is loaded beside it.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
if (!process.argv[2]) throw new Error("Pass the local PGlite module path.");
const modulePath=resolve(process.argv[2]);
const { PGlite }=await import(pathToFileURL(modulePath).href);
const { btree_gist }=await import(pathToFileURL(join(dirname(modulePath),"contrib/btree_gist.js")).href);
const db=new PGlite({extensions:{btree_gist}});
const admin="00000000-0000-4000-8000-000000000001",coachA="00000000-0000-4000-8000-000000000002",coachB="00000000-0000-4000-8000-000000000003";
let checks=0;
const read=async path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");
async function owner() {await db.exec("reset role");await db.query("select set_config('request.jwt.claims','{}',false)");}
async function identity(id,aal="aal1",role="authenticated") {await owner();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,aal})]);await db.exec(`set role ${role}`);}
async function scalar(sql,params=[]) {return (await db.query(sql,params)).rows[0].value;}
async function rejects(sql,params=[],code) {await assert.rejects(db.query(sql,params),error=>!code || error.code===code);checks++;}
async function insert(venue,part,coach=coachA,hour="14:00",status="scheduled",group=groupA) {
  return scalar("insert into events(group_id,event_type,start_at,duration_minutes,ends_at,venue_id,venue_part,coach_id,status,created_by) values($1,'training',$2,60,$2::timestamptz+interval '1 hour',$3,$4,$5,$6,$5) returning id as value",[group,`2026-10-11T${hour}:00Z`,venue,part,coach,status]);
}
let groupA,groupB,field,otherField,hall,alias;
try {
  await db.exec(await read("tests/venue-booking-baseline.sql"));
  const schema=await read("supabase/migrations/20260917154737_working_modules_schema_0_2_2.sql");
  for(const name of ["venues","events"]) {const block=schema.match(new RegExp(`create table public\\.${name} \\([\\s\\S]*?\\n\\);`));assert.ok(block);await db.exec(block[0]);}
  await db.exec("create table attendance_sessions(id uuid primary key default gen_random_uuid(),event_id uuid references events(id) on delete restrict); create table attendance_records(id uuid primary key default gen_random_uuid(),session_id uuid references attendance_sessions(id),status text);");
  const triggers=await read("supabase/migrations/20260917154843_working_business_triggers_0_2_2.sql");
  const triggerEnd=triggers.indexOf("create or replace function private.",triggers.indexOf("create trigger events_prevent_conflict"));
  assert.ok(triggerEnd>0);await db.exec(triggers.slice(0,triggerEnd));
  // Keep the original event validator, end calculation and readable conflict trigger.
  const policies=await read("supabase/migrations/20260917155702_working_rls_policies_0_2_2.sql");
  await db.exec("alter table venues enable row level security; alter table events enable row level security;");
  await db.exec(policies.split("\n").filter(line=>/^create policy (venues_|events_)/.test(line)).join("\n"));
  await db.exec("grant select,insert,update,delete on venues,events to authenticated;");
  await db.query("insert into profiles values($1,'admin','active'),($2,'coach','active'),($3,'coach','active')",[admin,coachA,coachB]);
  groupA=await scalar("insert into groups(code) values('U11A') returning id as value");groupB=await scalar("insert into groups(code) values('U11B') returning id as value");
  await db.query("insert into coach_group_assignments values($1,$2,true),($3,$4,true)",[coachA,groupA,coachB,groupB]);
  field=await scalar("insert into venues(name,venue_type) values('Поле 1','field') returning id as value");
  otherField=await scalar("insert into venues(name,venue_type) values('Нове довільне поле','field') returning id as value");
  hall=await scalar("insert into venues(name,venue_type) values('Зал','hall') returning id as value");
  alias=await scalar("insert into venues(name,venue_type) values('Стара ліва половина','field') returning id as value");
  // A legacy event exists before the proposal; raw identity/history must survive.
  const legacy=await scalar("insert into events(group_id,event_type,start_at,duration_minutes,ends_at,venue_id,coach_id,title) values($1,'training','2026-09-29T10:00Z',60,'2026-09-29T11:00Z',$2,$3,'Історія') returning id as value",[groupA,alias,coachA]);
  const attendance=await scalar("insert into attendance_sessions(event_id) values($1) returning id as value",[legacy]);
  await db.query("insert into attendance_records(session_id,status) values($1,'present')",[attendance]);
  await db.exec(await read("supabase/proposals/20261011202346_venue_half_bookings.sql"));
  await identity(admin,"aal2");await db.query("update venues set parent_venue_id=$1,venue_part='left' where id=$2",[field,alias]);
  await owner();const before=(await db.query("select venue_id,booking_venue_id,venue_part,title,start_at::text from events where id=$1",[legacy])).rows[0];
  assert.equal(before.venue_id,alias);assert.equal(before.booking_venue_id,field);assert.equal(before.venue_part,"left");assert.equal(before.title,"Історія");assert.match(before.start_at,/2026-09-29/);checks+=5;
  assert.equal(await scalar("select count(*)::integer as value from attendance_records r join attendance_sessions s on s.id=r.session_id where s.event_id=$1",[legacy]),1);checks++;
  await insert(field,"left");const right=await insert(field,"right",coachB,"14:00","scheduled",groupB);checks+=2;
  await rejects("update events set venue_part='whole' where id=$1",[right],"23P01");
  await rejects("update events set venue_part='left' where id=$1",[right],"23P01");
  // All combinations of whole/left/right, different coaches, actual PostgreSQL constraints.
  for(const first of ["whole","left","right"]) for(const second of ["whole","left","right"]) {
    await db.exec("delete from events where start_at >= '2026-10-11'");await insert(field,first);
    const promise=insert(field,second,coachB,"14:00","scheduled",groupB);
    if(first==="whole" || second==="whole" || first===second) await assert.rejects(promise,error=>error.code==="23P01");else await promise;checks++;
  }
  await db.exec("delete from events where start_at >= '2026-10-11'");const occupied=await insert(field,"left");
  await insert(otherField,"whole",coachB,"14:00","scheduled",groupB);checks++;
  await insert(field,"whole",coachB,"15:00","scheduled",groupB);checks++;
  await assert.rejects(insert(field,"right",coachA),error=>error.code==="23P01");checks++;
  await assert.rejects(insert(alias,"whole",coachB,"14:00","scheduled",groupB),error=>error.code==="23P01");checks++;
  await db.query("update events set booking_part='right',booking_venue_id=$1 where id=$2",[otherField,occupied]);
  assert.equal(await scalar("select booking_part as value from events where id=$1",[occupied]),"left");assert.equal(await scalar("select booking_venue_id as value from events where id=$1",[occupied]),field);checks+=2;
  await identity(coachB);const availability=(await db.query("select * from venue_booking_conflicts($1,'2026-10-11T14:30Z',30)",[field])).rows;
  assert.equal(availability.length,1);assert.equal(availability[0].venue_part,"left");assert.equal(availability[0].group_code,"U11A");checks+=3;
  assert.equal(await scalar("select count(*)::integer as value from events where id=$1",[occupied]),0);checks++;
  await rejects("select * from venue_booking_conflicts($1,'2026-10-11T14:00Z',60,$2)",[field,occupied],"42501");
  assert.equal((await db.query("update venues set supports_half_booking=true where id=$1 returning id",[hall])).rows.length,0);checks++;
  assert.equal(await scalar("select supports_half_booking as value from venues where id=$1",[hall]),false);checks++;
  await identity(admin,"aal1");await rejects("select * from venue_booking_conflicts($1,'2026-10-11T14:00Z',60,$2)",[field,occupied],"42501");
  await identity(admin,"aal2");await db.query("update events set status='cancelled' where id=$1",[occupied]);
  await owner();await insert(field,"whole",coachA);checks++;
  await assert.rejects(insert(hall,"left",coachB,"16:00","scheduled",groupB),error=>error.code==="23514");checks++;
  await identity(admin,"aal2");await db.query("update venues set supports_half_booking=true where id=$1",[hall]);
  await owner();await insert(hall,"left",coachB,"16:00","scheduled",groupB);checks++;
  await rejects("update venues set supports_half_booking=false where id=$1",[hall],"23514");
  await rejects("update venues set parent_venue_id=$1,venue_part='right' where id=$2",[otherField,alias],"23514");
  await rejects("update venues set parent_venue_id=id,venue_part='left' where id=$1",[otherField],"23514");
  await rejects("update venues set parent_venue_id=$1,venue_part='left' where id=$2",[alias,otherField],"23514");
  await identity(coachA);await owner();await db.query("update profiles set status='suspended' where id=$1",[coachA]);await identity(coachA);
  await rejects("select * from venue_booking_conflicts($1,'2026-10-11T14:00Z',60)",[field],"42501");
  await identity(coachA,"aal1","anon");await rejects("select * from venue_booking_conflicts($1,'2026-10-11T14:00Z',60)",[field],"42501");
  await owner();
  // Disable the readable SELECT trigger: engine constraints still reject overlaps.
  await db.exec("delete from events where start_at >= '2026-10-11' and venue_id <> "+"'"+field+"'; alter table events disable trigger events_prevent_conflict");
  await assert.rejects(insert(field,"left",coachB,"14:00","scheduled",groupB),error=>error.code==="23P01" && error.message.includes("events_venue_booking_excl"));checks++;
  const conflictingAlias=await scalar("insert into venues(name,venue_type) values('Непов’язана стара половина','field') returning id as value");
  const aliasEvent=await insert(conflictingAlias,"whole",coachB,"14:00","scheduled",groupB);
  await identity(admin,"aal2");await rejects("update venues set parent_venue_id=$1,venue_part='right' where id=$2",[field,conflictingAlias],"23P01");
  await owner();assert.equal(await scalar("select parent_venue_id as value from venues where id=$1",[conflictingAlias]),null);assert.equal(await scalar("select booking_venue_id as value from events where id=$1",[aliasEvent]),conflictingAlias);checks+=2;
  // A real coach writes only an assigned group; no new write privileges are granted.
  await identity(coachB);await insert(otherField,"right",coachB,"18:00","scheduled",groupB);checks++;
  await assert.rejects(insert(otherField,"left",coachB,"19:00","scheduled",groupA),error=>error.code==="42501");checks++;
  console.log(`PASS: ${checks} isolated PostgreSQL booking checks; no external DB used. Concurrent connections require a separate PostgreSQL service; exclusion constraints are verified here.`);
} finally {await db.close();}
