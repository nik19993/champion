// Synthetic server adapter, no accounts, credentials or Supabase connection.
import { createRoot } from "react-dom/client";
import { TrainingRegisterModal } from "../../components/coach/training-register";
import { CoachPlan } from "../../components/coach/coach-plan";
import { flushAttendanceQueue } from "../../lib/offline/attendance-queue";
import { kyivDateKey } from "../../lib/domain/format";
const today = kyivDateKey(new Date());
const group = { id: "group-a", code: "U11A", display_code: "U11A", age: 11, group_kind: "age" };
const profile = { id: "coach-a", full_name: "Тестовий тренер", role: "coach", status: "active" };
const event = { id: "event-a", group_id: group.id, groups: group, coach_id: profile.id, event_type: "training", start_at: `${today}T08:00:00Z`, duration_minutes: 60, status: "scheduled", venues: null, venue_id: null, task_id: null };
const initial = { players: [{ id: "player-a", full_name: "Тестовий Гравець А", group_id: group.id, is_active: true }, { id: "player-b", full_name: "Тестовий Гравець Б", group_id: group.id, is_active: true }], attendance_sessions: [], attendance_records: [], player_behavior_cards: [], player_club_cards: [], training_register_completions: [], venues: [], methodology_tasks: [], monthly_star_themes: [], announcements: [], events: [event] };
const qa = { db: JSON.parse(localStorage.getItem("register-fixture-db") ?? "null") ?? initial, mode: "normal", calls: [], changed: 0, nextId: 1 };
window.registerQa = qa;
const persist = () => localStorage.setItem("register-fixture-db", JSON.stringify(qa.db));
function invalidate() { for (const row of qa.db.training_register_completions) row.completed_at = null; }
class Query {
  constructor(table) { this.table = table; this.filters = []; this.operation = "read"; }
  select() { return this; }
  eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
  neq(key, value) { this.filters.push((row) => row[key] !== value); return this; }
  in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
  gte() { return this; } lt() { return this; } lte() { return this; } or() { return this; } order() { return this; }
  maybeSingle() { this.one = true; return this; }
  insert(payload) { this.operation = "insert"; this.payload = payload; return this; }
  then(resolve, reject) { return this.execute().then(resolve, reject); }
  async execute() {
    qa.calls.push({ table: this.table, operation: this.operation, payload: this.payload });
    if (qa.mode === "read-error" && this.table === "player_behavior_cards" && this.operation === "read") return { data: null, error: { code: "FAILURE" } };
    if (this.operation === "insert") {
      if (qa.mode === "card-pending") await new Promise((resolve) => { qa.resolveCard = resolve; });
      if (qa.mode === "card-error") return { data: null, error: { code: "FAILURE" } };
      const row = { id: `card-${qa.nextId++}`, is_voided: false, ...this.payload };
      qa.db[this.table].push(row); invalidate(); persist();
      return { data: null, error: null };
    }
    const result = (qa.db[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row))).map((row) => {
      if (this.table === "attendance_sessions") return { ...row, attendance_records: qa.db.attendance_records.filter((record) => record.session_id === row.id).map((record) => ({ ...record, players: qa.db.players.find((player) => player.id === record.player_id) ?? null })) };
      if (this.table === "events") return { ...row, attendance_sessions: qa.db.attendance_sessions[0] ?? null, training_register_completions: qa.db.training_register_completions[0] ?? null };
      return row;
    });
    return { data: this.one ? result[0] ?? null : structuredClone(result), error: null };
  }
}
const client = { from: (table) => new Query(table), rpc: async (name, args) => {
  qa.calls.push({ rpc: name, args });
  if (name === "save_attendance") {
    const session = { id: "session-a", event_id: event.id, completed_at: new Date().toISOString(), server_version: (qa.db.attendance_sessions[0]?.server_version ?? 0) + 1 };
    qa.db.attendance_sessions = [session];
    qa.db.attendance_records = args.p_records.map((record) => ({ ...record, session_id: session.id }));
    invalidate(); persist(); return { data: session.id, error: null };
  }
  if (name === "void_behavior_card") {
    const card = qa.db.player_behavior_cards.find((row) => row.id === args.p_card_id);
    card.is_voided = true; card.void_reason = args.p_reason;
    invalidate(); persist(); return { data: null, error: null };
  }
  if (name === "complete_training_register" || name === "complete_training_register_with_club_cards") {
    if (qa.mode === "finalize-error") return { data: null, error: { message: "Offline" } };
    if (qa.mode === "null-finalize") return { data: null, error: null };
    if (qa.mode === "stale-register") return { data: null, error: { message: "REGISTER_CHANGED" } };
    const completion = { event_id: event.id, completed_at: new Date().toISOString(), completed_by: profile.id, attendance_version: qa.db.attendance_sessions[0].server_version, present_count: qa.db.attendance_records.filter((row) => row.status === "present").length, player_count: qa.db.attendance_records.length, card_count: qa.db.player_behavior_cards.filter((row) => !row.is_voided).length, club_card_count: (qa.db.player_club_cards ?? []).filter((row) => !row.is_voided).length };
    qa.db.training_register_completions = [completion]; persist();
    return { data: completion, error: null };
  }
  return { data: [], error: null };
} };
const root = createRoot(document.getElementById("root"));
qa.open = () => root.render(<TrainingRegisterModal key={qa.openId = (qa.openId ?? 0) + 1} client={client} profile={profile} event={qa.db.events[0]} onClose={() => qa.coach()} onChanged={() => qa.changed++} onCompleted={() => qa.coach()} />);
qa.coach = () => { localStorage.setItem("register-fixture-view", "coach"); root.render(<CoachPlan client={client} profile={profile} groups={[group]} />); };
qa.flush = () => flushAttendanceQueue(client, profile.id);
qa.reset = async () => {
  localStorage.clear();
  await new Promise((resolve, reject) => { const request = indexedDB.deleteDatabase("champion-offline"); request.onsuccess = resolve; request.onerror = reject; });
};
if (localStorage.getItem("register-fixture-view") === "coach") qa.coach(); else qa.open();
