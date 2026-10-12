// Synthetic in-browser adapter. It never connects to Supabase or uses real users.
import { createRoot } from "react-dom/client";
import { CoachPlan } from "../../components/coach/coach-plan";
import { VenueManagement } from "../../components/admin/admin-management";
import { AdminEventModal, AdminReport } from "../../components/admin/admin-plan";
import { AdminExport } from "../../components/admin/admin-export";
import { kyivDateKey } from "../../lib/domain/format";

const day = kyivDateKey(new Date());
const groups = [
  { id: "group-a", code: "U11A", display_code: "U12A", age: 11, group_kind: "age", cohort_birth_year: 2016 },
  { id: "group-b", code: "U11B", display_code: "U12B", age: 11, group_kind: "age", cohort_birth_year: 2016 },
];
const profile = { id: "coach-fixture", full_name: "Тестовий тренер", role: "coach", status: "active" };
const longTask = "Зупинка м’яча та передача після відкривання партнера у вільний простір. ".repeat(8);
const event = (id, group, hour, attendance = []) => ({ id, group_id: group.id, groups: group, event_type: "training", status: "scheduled", coach_id: profile.id, start_at: `${day}T${hour}:00:00Z`, duration_minutes: 75, venue_id: "venue-a", task_id: "task-a", methodology_tasks: { title: longTask }, venues: { name: "Тестове поле" }, attendance_sessions: attendance, needs_substitute: false });
const db = {
  events: [event("event-a", groups[0], "08"), event("event-b", groups[1], "10"), event("event-history", groups[1], "12", [{ id: "session-history", completed_at: `${day}T13:00:00Z` }]), event("event-unassigned", { id: "group-z", code: "U15A" }, "14"), { ...event("event-other-coach", groups[0], "16"), coach_id: "other-coach" }],
  attendance_sessions: [{ id: "session-history", event_id: "event-history", completed_at: `${day}T13:00:00Z` }],
  attendance_records: [{ id: "record-history", session_id: "session-history", player_id: "synthetic-player", status: "present" }],
  profiles: [profile],
  venues: [{ id: "venue-a", name: "Тестове поле", venue_type: "field", is_active: true }, { id: "venue-b", name: "Довільний новий майданчик", venue_type: "field", is_active: true }, { id: "venue-hall", name: "Спортивний зал", venue_type: "hall", is_active: true }, { id: "venue-legacy", name: "Стара ліва половина", venue_type: "field", is_active: true, parent_venue_id: "venue-a", venue_part: "left" }],
  methodology_tasks: [{ id: "task-a", title: longTask, age_from: 6, age_to: 17, is_active: true, sort_order: 0 }],
  announcements: [], monthly_star_themes: [],
  operational_items: [
    { id: "report-a", group_id: "group-a", item_type: "organizational_need", status: "todo", title: "Організаційні потреби", comment: "Автобус; Лікар; Інше: питна вода", created_at: `${day}T07:00:00Z`, groups: groups[0], events: { start_at: `${day}T15:00:00Z`, event_type: "tournament", title: "Турнір групи", venues: { name: "Тестове поле" }, coach: { full_name: "Тестовий тренер" } } },
    { id: "report-b", group_id: "group-b", item_type: "comment", status: "todo", title: "Коментар тренера", comment: "Потрібно перенести заняття через відсутність освітлення.\nТелефонувати відповідальному за поле.", created_at: `${day}T07:00:00Z`, groups: [groups[1]], creator: { full_name: "Другий тестовий тренер", role: "coach" }, events: null },
  ],
};
const qa = { db, calls: [], availability: [], mode: "normal", longTask };
window.calendarQa = qa;

class Query {
  constructor(table) { this.table = table; this.filters = []; this.operation = "read"; }
  select(columns, options) { this.columns = columns; this.options = options; return this; }
  eq(key, value) { this.filters.push((row) => row[key] === value); return this; }
  neq(key, value) { this.filters.push((row) => row[key] !== value); return this; }
  in(key, values) { this.filters.push((row) => values.includes(row[key])); return this; }
  gte(key, value) { this.filters.push((row) => row[key] >= value); return this; }
  lt(key, value) { this.filters.push((row) => row[key] < value); return this; }
  lte(key, value) { this.filters.push((row) => row[key] <= value); return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; this.optional = true; return this; }
  insert(payload) { this.operation = "insert"; this.payload = payload; return this; }
  update(payload) { this.operation = "update"; this.payload = payload; return this; }
  upsert(payload) { this.operation = "upsert"; this.payload = payload; return this; }
  delete() { this.operation = "delete"; return this; }
  then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); }
  run() {
    let rows = (db[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row)));
    qa.calls.push({ table: this.table, operation: this.operation, payload: this.payload, ids: rows.map((row) => row.id), columns: this.columns });
    if (this.table === "events" && this.operation === "delete") {
      if (qa.mode === "reject-delete") throw new Error("Synthetic network failure");
      if (qa.mode === "zero-delete") rows = [];
      if (rows.some((row) => row.coach_id !== profile.id)) rows = [];
      if (rows.some((row) => db.attendance_sessions.some((session) => session.event_id === row.id))) return { data: null, error: { code: "23503" } };
      db.events = db.events.filter((row) => !rows.includes(row));
    } else if (this.operation === "update") {
      if (this.table === "events") rows = rows.filter((row) => row.coach_id === profile.id);
      rows.forEach((row) => Object.assign(row, this.payload));
    } else if (this.operation === "insert" || this.operation === "upsert") {
      rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((payload) => ({ ...payload, id: payload.id ?? crypto.randomUUID(), status: payload.status ?? "scheduled", groups: groups.find((group) => group.id === payload.group_id), attendance_sessions: [] }));
      (db[this.table] ??= []).push(...rows);
    }
    if (this.options?.head) return { data: null, error: null, count: rows.length };
    if (this.one) return rows.length ? { data: rows[0], error: null } : { data: null, error: this.optional ? null : { code: "PGRST116" } };
    return { data: structuredClone(rows), error: null };
  }
}
const client = { from: (table) => new Query(table), auth: { getUser: () => Promise.resolve({ data: { user: { id: "admin-fixture" } } }) }, rpc: (name, args) => {
  qa.calls.push({ rpc: name, args });
  if (qa.mode === "reject-availability") return Promise.reject(new Error("Synthetic availability failure"));
  return Promise.resolve({ data: qa.availability, error: null });
} };
const root = createRoot(document.getElementById("root"));
qa.coach = () => root.render(<CoachPlan client={client} profile={profile} groups={groups} />);
qa.venues = () => root.render(<VenueManagement client={client} profile={{ ...profile, id: "admin-fixture", role: "admin" }} />);
qa.adminEvent = (id) => root.render(<AdminEventModal client={client} eventId={id} onClose={() => qa.coach()} onSaved={() => qa.coach()} />);
qa.report = () => root.render(<AdminReport client={client} />);
qa.export = () => root.render(<AdminExport client={client} profile={{ ...profile, role: "admin" }} groups={groups} />);
root.render(<CoachPlan client={client} profile={profile} groups={groups} />);
