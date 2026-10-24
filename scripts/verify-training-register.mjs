// In-memory PostgreSQL contract tests; never connects to a remote database.
// Usage: node scripts/verify-training-register.mjs PGLITE_MODULE
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const coach = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002", admin = "00000000-0000-4000-8000-000000000003";
let checks = 0;
let currentRole = "authenticated";
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
async function identity(id, role = "authenticated", aal = "aal1") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, aal })]);
  await db.exec(`set role ${role}`);
  currentRole = role;
}
async function rows(sql, args = []) { return (await db.query(sql, args)).rows; }
async function snapshot(event) {
  if (currentRole === "anon") return [];
  return rows("select player_id,status,note from attendance_records r join attendance_sessions s on s.id=r.session_id where s.event_id=$1", [event]);
}
async function rejected(sql, args, message) {
  if (sql.includes("complete_training_register(")) {
    sql = sql.replace(/complete_training_register\((.*)\)/, (_, params) => `complete_training_register(${params},$${args.length + 1}::jsonb)`);
    args = [...args, JSON.stringify(await snapshot(args[0]))];
  }
  await assert.rejects(db.query(sql, args), new RegExp(message)); checks++;
}
async function save(event, players) {
  return (await rows("select save_attendance($1,gen_random_uuid(),clock_timestamp(),$2) as id", [event, JSON.stringify(players.map((p) => ({ player_id: p.id, status: p.status ?? "present", note: "" })))]))[0].id;
}
async function finish(event, cardIds = [], version) {
  const session = (await rows("select server_version from attendance_sessions where event_id=$1", [event]))[0];
  return (await rows("select complete_training_register($1,$2,$3,$4::jsonb) as value", [event, version ?? session?.server_version ?? 0, cardIds, JSON.stringify(await snapshot(event))]))[0].value;
}
try {
  await db.exec(await readFile(new URL("../tests/training-register-baseline.sql", import.meta.url), "utf8"));
  const files = await readdir(new URL("../supabase/proposals/", import.meta.url));
  const sql = await readFile(new URL(`../supabase/proposals/${files.find((name) => name.endsWith("_training_register_completion.sql"))}`, import.meta.url), "utf8");
  await db.exec(sql);
  await db.exec("revoke all on function public.save_attendance(uuid,uuid,timestamptz,jsonb) from public,anon; grant execute on function public.save_attendance(uuid,uuid,timestamptz,jsonb) to authenticated");
  const rules = await readFile(new URL("../supabase/migrations/20260928092916_coach_photo_and_training_card_rules.sql", import.meta.url), "utf8");
  const start = rules.indexOf("create or replace function private.prepare_behavior_card()");
  await db.exec(rules.slice(start, rules.indexOf("$$;", start) + 3));
  await db.exec("create trigger card_prepare before insert or update on player_behavior_cards for each row execute function private.prepare_behavior_card()");
  await db.query("insert into profiles values($1,'coach','active','Coach'),($2,'coach','active','Other'),($3,'admin','active','Admin')", [coach, other, admin]);
  const group = (await rows("insert into groups default values returning id"))[0].id;
  const otherGroup = (await rows("insert into groups default values returning id"))[0].id;
  await db.query("insert into coach_group_assignments values($1,$2,true),($3,$4,true)", [coach, group, other, otherGroup]);
  const players = await rows("insert into players(group_id) values($1),($1) returning id", [group]);
  players[1].status = "absent";
  const events = await rows("insert into events(group_id,start_at,ends_at,venue_id) values($1,'2000-01-01','2000-01-01 01:00',gen_random_uuid()),($1,'2099-01-01','2099-01-01 01:00',gen_random_uuid()) returning *", [group]);
  await identity(coach);
  await rejected("select complete_training_register($1,1,'{}')", [events[0].id], "ATTENDANCE_REQUIRED");
  for (const event of events) {
    await save(event.id, players);
    const result = await finish(event.id);
    check([result.present_count, result.player_count, result.card_count], [1, 2, 0]);
    check((await finish(event.id)).completed_at, result.completed_at);
    check((await rows("select status,start_at,ends_at,venue_id,venue_part from events where id=$1", [event.id]))[0], Object.fromEntries(["status", "start_at", "ends_at", "venue_id", "venue_part"].map((key) => [key, event[key]])));
  }
  const event = events[0].id;
  const card = (await rows("insert into player_behavior_cards(player_id,group_id,coach_id,event_id,occurred_on) values($1,$2,$3,$4,'2000-01-01') returning id", [players[0].id, group, coach, event]))[0].id;
  check((await rows("select completed_at from training_register_completions where event_id=$1", [event]))[0].completed_at, null);
  await rejected("select complete_training_register($1,1,'{}')", [event], "REGISTER_CHANGED");
  check((await finish(event, [card])).card_count, 1);
  await rows("update player_behavior_cards set is_voided=true,voided_by=$1,voided_at=now(),void_reason='Synthetic mistake' where id=$2", [coach, card]);
  check((await rows("select completed_at from training_register_completions where event_id=$1", [event]))[0].completed_at, null);
  check((await finish(event)).card_count, 0);
  check((await rows("select is_voided,void_reason from player_behavior_cards where id=$1", [card]))[0], { is_voided: true, void_reason: "Synthetic mistake" });
  await save(event, players);
  check((await rows("select completed_at from training_register_completions where event_id=$1", [event]))[0].completed_at, null);
  await rejected("select complete_training_register($1,1,'{}')", [event], "REGISTER_CHANGED");
  await finish(event);
  const oldRecords = await snapshot(event);
  const oldVersion = (await rows("select server_version from attendance_sessions where event_id=$1", [event]))[0].server_version;
  await db.exec("reset role");
  await db.query("update attendance_records set note='Synthetic concurrent correction' where player_id=$1 and session_id=(select id from attendance_sessions where event_id=$2)", [players[0].id,event]);
  await identity(coach);
  await assert.rejects(db.query("select complete_training_register($1,$2,'{}',$3::jsonb)",[event,oldVersion,JSON.stringify(oldRecords)]),/REGISTER_CHANGED/); checks++;
  await finish(event);
  await rejected("update training_register_completions set completed_at=now()", [], "permission denied");
  await rejected("insert into training_register_completions(event_id,attendance_version,present_count,player_count,card_count) values(gen_random_uuid(),1,0,0,0)", [], "permission denied");
  await identity(other);
  check((await rows("select * from training_register_completions")).length, 0);
  await rejected("select complete_training_register($1,2,'{}')", [event], "ACCESS_DENIED");
  await identity(coach, "anon");
  await rejected("select complete_training_register($1,2,'{}')", [event], "permission denied");
  await identity(admin);
  await rejected("select complete_training_register($1,2,'{}')", [event], "ACCESS_DENIED");
  await identity(admin, "authenticated", "aal2");
  check((await finish(event)).player_count, 2);
  await db.exec("reset role");
  await db.query("update players set is_active=false where id=$1", [players[1].id]);
  await identity(coach);
  await save(event, [players[0]]);
  check((await finish(event)).player_count, 2);
  check((await rows("select count(*)::integer as n from attendance_records r join attendance_sessions s on s.id=r.session_id where s.event_id=$1", [event]))[0].n, 2);
  const invalidCard = (await rows("insert into player_behavior_cards(player_id,group_id,coach_id,event_id,occurred_on) values($1,$2,$3,$4,'2000-01-01') returning id", [players[1].id, group, coach, event]))[0].id;
  await rejected("select complete_training_register($1,3,$2)", [event, [invalidCard]], "CARD_ATTENDANCE_MISMATCH");
  await db.exec("reset role");
  await db.query("update events set status='cancelled' where id=$1", [event]);
  await identity(coach);
  await rejected("select complete_training_register($1,3,$2)", [event, [invalidCard]], "EVENT_NOT_FOUND");
  await db.exec("reset role");
  await db.query("update profiles set status='suspended' where id=$1", [coach]);
  await identity(coach);
  await rejected("select complete_training_register($1,1,'{}')", [events[1].id], "ACCESS_DENIED");
  console.log(`PASS: ${checks} isolated PostgreSQL checks; historical/future dates, scoped access, invalidation and booking preservation. No external DB used.`);
} finally { await db.close(); }
