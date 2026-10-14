// Only synthetic users/data; all I/O stays inside the browser fixture.
import { createRoot } from "react-dom/client";
import { AuthGate } from "../../components/auth/auth-gate";
import { CoachInventory } from "../../components/coach/coach-inventory";
import { InventoryManagement } from "../../components/admin/inventory-management";
import { AdminUniform } from "../../components/admin/admin-uniform";
import { AdminExport } from "../../components/admin/admin-export";

const profiles = {
  "coach-a": { id: "coach-a", full_name: "Тестовий тренер А", role: "coach", status: "active", must_change_password: true },
  "coach-b": { id: "coach-b", full_name: "Тестовий тренер Б", role: "coach", status: "active", must_change_password: true },
  "admin": { id: "admin", full_name: "Тестовий адміністратор", role: "admin", status: "active" },
};
const groups = [{ id: "group-a", code: "U11A", display_age: 12, display_code: "U12A", age: 11, group_kind: "age" }];
const qa = { profiles, current: { user: { id: "coach-a" } }, listeners: [], modes: {}, calls: [], pendingProfiles: {}, delayProfile: null, sessionRelease: null };
window.readinessQa = qa;
const db = {
  profiles: Object.values(profiles),
  inventory_items: [{ id: "item-a", group_id: "group-a", name: "Тестовий інвентар", quantity: 5, damaged: 0, lost: 0, needed: 0, is_active: true }],
  inventory_permissions: [{ id: "permission-a", group_id: "group-a", coach_id: "coach-a", can_edit_quantity: true, can_report_issues: true }],
  uniform_requests: [{ id: "request-a", player_id: "player-a", status: "requested", admin_note: "", number: null, surname_print: "", players: { id: "player-a", full_name: "Тестовий Гравець", groups: groups[0] }, uniform_request_items: [] }],
  uniform_catalog_items: [], players: [],
};
qa.db = db;
class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select(fields, options) { this.options = options; return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  order() { return this; }
  range(start, end) { this.start = start; this.end = end; return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  update(payload) { this.payload = payload; return this; }
  insert(payload) { this.payload = payload; this.inserted = true; return this; }
  then(resolve, reject) { return Promise.resolve().then(async () => {
    const rows = (db[this.table] ?? []).filter(row => this.filters.every(filter => filter(row)));
    if (this.table === "profiles" && this.one && rows[0]?.id === qa.delayProfile) {
      await new Promise(release => { qa.pendingProfiles[rows[0].id] = release; });
    }
    if (this.payload) {
      qa.calls.push({ table: this.table, payload: this.payload });
      const mode = qa.modes[this.table];
      if (mode === "error") return { data: null, error: { code: "42501" } };
      if (mode === "null") return { data: null, error: null };
      if (mode === "wrong") return { data: { id: "wrong-row" }, error: null };
      if (mode === "throw") throw new Error("Synthetic network failure");
      if (this.inserted) return { data: null, error: null };
      rows.forEach(row => Object.assign(row, this.payload));
      return { data: this.one ? structuredClone(rows[0]) : structuredClone(rows), error: null };
    }
    if (this.options?.head) return { data: null, error: null, count: rows.length };
    let result = rows;
    if (this.start != null) result = rows.slice(this.start, this.end + 1);
    return { data: this.one ? structuredClone(result[0] ?? null) : structuredClone(result), error: null, count: rows.length };
  }).then(resolve, reject); }
}
qa.emit = (event, session) => { qa.current = session; for (const callback of qa.listeners) callback(event, session); };
qa.login = id => qa.emit("SIGNED_IN", { user: { id } });
qa.client = {
  from: table => new Query(table),
  auth: {
    getSession: async () => {
      const session = qa.current;
      if (location.hash === "#session-race") await new Promise(release => { qa.sessionRelease = release; });
      return { data: { session } };
    },
    getUser: async () => ({ data: { user: { id: "admin" } }, error: null }),
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal2" }, error: null }) },
    onAuthStateChange: callback => { qa.listeners.push(callback); return { data: { subscription: { unsubscribe() { qa.listeners = qa.listeners.filter(item => item !== callback); } } } }; },
    signOut: async () => { qa.emit("SIGNED_OUT", null); return { error: null }; },
  },
};
createRoot(document.getElementById("auth")).render(<AuthGate />);
createRoot(document.getElementById("coach-inventory")).render(<CoachInventory client={qa.client} profile={profiles["coach-a"]} groups={groups} />);
createRoot(document.getElementById("admin-inventory")).render(<InventoryManagement client={qa.client} profile={profiles.admin} groups={groups} />);
createRoot(document.getElementById("uniform")).render(<AdminUniform client={qa.client} profile={profiles.admin} groups={groups} />);
createRoot(document.getElementById("export")).render(<AdminExport client={qa.client} profile={profiles.admin} groups={groups} />);
