// Synthetic browser state only; never connects to Supabase or real accounts.
import { createRoot } from "react-dom/client";
import { CoachPlan } from "../../components/coach/coach-plan";
import { kyivDateKey } from "../../lib/domain/format";

const day = kyivDateKey(new Date());
const profile = { id: "coach-test", full_name: "Тестовий тренер", role: "coach", status: "active" };
const group = { id: "group-test", code: "U12A", group_kind: "age", display_age: 12, age: 12 };
const task = { id: "task-test", title: "Завдання для перевірки документа", is_active: true, age_from: 12, age_to: 12 };
const initial = {
  events: [{ id: "event-test", group_id: group.id, groups: group, coach_id: profile.id, event_type: "training", status: "scheduled", start_at: `${day}T08:00:00Z`, duration_minutes: 60, task_id: task.id, title: task.title, methodology_tasks: task, venue_id: "venue-test", venues: { name: "Тестове поле" } }],
  file_assets: [], event_materials: [], methodology_materials: [],
};
const db = JSON.parse(localStorage.getItem("document-qa") ?? "null") ?? initial;
db.venues = [{ id: "venue-test", name: "Тестове поле", is_active: true, venue_type: "field" }];
db.methodology_tasks = [task];
const qa = { db, calls: [], mode: "normal", persist: () => localStorage.setItem("document-qa", JSON.stringify(db)) };
window.documentQa = qa;

class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = "read"; }
  select(columns, options) { this.columns = columns; this.options = options; return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  neq(key, value) { this.filters.push(row => row[key] !== value); return this; }
  in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
  gte(key, value) { this.filters.push(row => row[key] >= value); return this; }
  lt(key, value) { this.filters.push(row => row[key] < value); return this; }
  lte(key, value) { this.filters.push(row => row[key] <= value); return this; }
  or() { return this; }
  order() { return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; this.optional = true; return this; }
  insert(payload) { this.op = "insert"; this.payload = payload; return this; }
  update(payload) { this.op = "update"; this.payload = payload; return this; }
  upsert(payload) { this.op = "upsert"; this.payload = payload; return this; }
  delete() { this.op = "delete"; return this; }
  then(ok, fail) { return Promise.resolve().then(() => this.run()).then(ok, fail); }
  run() {
    qa.calls.push({ table: this.table, op: this.op, payload: this.payload });
    if (qa.mode === "read-error" && this.table === "event_materials" && this.op === "read") return { error: Error("Synthetic read error"), data: null };
    let rows = (db[this.table] ?? []).filter(row => this.filters.every(filter => filter(row)));
    if (this.op === "insert" || this.op === "upsert") {
      rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(payload => ({ ...payload, id: payload.id ?? crypto.randomUUID(), status: payload.status ?? "scheduled", groups: group, methodology_tasks: task, venues: { name: "Тестове поле" } }));
      (db[this.table] ??= []).push(...rows);
    } else if (this.op === "update") rows.forEach(row => Object.assign(row, this.payload));
    else if (this.op === "delete") db[this.table] = (db[this.table] ?? []).filter(row => !rows.includes(row));
    if (this.op !== "read") qa.persist();
    if (this.columns?.includes("file_assets(")) rows = rows.map(row => ({ ...row, file_assets: db.file_assets.find(asset => asset.id === row.file_asset_id) ?? null }));
    if (this.options?.head) return { data: null, count: rows.length, error: null };
    if (this.one) return { data: rows[0] ?? null, error: !rows.length && !this.optional ? Error("Missing fixture row") : null };
    return { data: structuredClone(rows), error: null };
  }
}

const client = {
  from: table => new Query(table),
  rpc: async (name, args) => {
    qa.calls.push({ rpc: name, args });
    if (name === "venue_booking_conflicts") return { data: [], error: null };
    if (name.startsWith("attach_event")) {
      if (qa.mode === "attach-error") return { error: Error("Synthetic attach failure") };
      if (!db.event_materials.some(row => row.event_id === args.p_event_id && row.file_asset_id === args.p_file_asset_id)) db.event_materials.push({ id: crypto.randomUUID(), event_id: args.p_event_id, file_asset_id: args.p_file_asset_id });
      qa.persist(); return { data: null, error: null };
    }
    return { data: [], error: null };
  },
  storage: { from: bucket => ({
    upload: async (path, file, options) => { qa.calls.push({ storage: "upload", bucket, path, name: file.name, mime: options.contentType }); return { error: null }; },
    remove: async () => ({ error: null }),
    createSignedUrl: async () => ({ data: { signedUrl: "https://documents-check.test/synthetic-document" }, error: null }),
  }) },
  functions: { invoke: async (name, { body }) => {
    db.file_assets.find(asset => asset.id === body.file_asset_id).scan_status = "clean";
    qa.persist(); return { data: { status: "clean" }, error: null };
  } },
};
createRoot(document.getElementById("root")).render(<CoachPlan client={client} profile={profile} groups={[group]} />);
