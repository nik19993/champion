import test from "node:test";
import assert from "node:assert/strict";
import { APPLICATION_BACKUP_TABLES, collectApplicationBackup } from "../lib/domain/application-backup.ts";

function fixture(options = {}) {
  const calls = [];
  let validations = 0;
  const data = Object.fromEntries(APPLICATION_BACKUP_TABLES.map(({ name, key }) => [name, Array.from({ length: name === "players" ? 1207 : 2 }, (_, index) => Object.fromEntries(key.map((column) => [column, `${column}-${String(index).padStart(5,"0")}`])))]));
  data.profiles = [{ id: "admin", role: "admin", status: "active" }];
  class Query {
    constructor(table) { this.table = table; this.orders = []; }
    select(fields, config) { this.fields = fields; this.config = config; return this; }
    eq(column, value) { this.filter = { column, value }; return this; }
    single() { this.one = true; return this; }
    order(column) { this.orders.push(column); return this; }
    range(start, end) { this.start = start; this.end = end; return this; }
    then(resolve, reject) { return Promise.resolve().then(() => {
      if (this.one) return { data: data.profiles[0], error: null };
      calls.push({ table: this.table, start: this.start, end: this.end, orders: this.orders });
      if (options.errorTable === this.table) return { data: null, error: { message: "denied" }, count: null };
      const total = data[this.table].length;
      let rows = this.config?.head ? null : data[this.table].slice(this.start, Math.min(this.end + 1, this.start + (options.cap ?? 100)));
      let count = total;
      if (options.nullData && this.table === "players") rows = null;
      if (options.nullCount && this.table === "players") count = null;
      if (options.truncated && this.table === "players" && this.start > 0) rows = [];
      if (options.duplicate && this.table === "players" && this.start > 0) rows = data.players.slice(0, 100);
      if (options.changed && this.table === "players" && this.start > 0) count++;
      if (options.finalChanged && this.table === "players" && this.config?.head) count++;
      return { data: rows, error: null, count };
    }).then(resolve, reject); }
  }
  const client = {
    from: (table) => new Query(table),
    auth: {
      getUser: async () => { validations++; return { data: { user: { id: options.switchedUser && validations > 1 ? "other" : "admin" } }, error: null }; },
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: options.aal ?? "aal2" }, error: null }) },
    },
  };
  return { client, data, calls };
}

test("backup includes all 47 application tables and paginates beyond a lowered server cap", async () => {
  const { client, calls } = fixture();
  const backup = await collectApplicationBackup(client, "admin");
  assert.equal(APPLICATION_BACKUP_TABLES.length, 47);
  assert.equal(backup.players.length, 1207);
  assert.equal(backup.row_counts.players, 1207);
  assert.equal(backup.full_recovery_backup, false);
  for (const table of APPLICATION_BACKUP_TABLES) assert.ok(Array.isArray(backup[table.name]), table.name);
  assert.deepEqual(calls.filter(call => call.table === "players" && call.start !== undefined).map(call => call.start), Array.from({ length: 13 }, (_, index) => index * 100));
  for (const call of calls.filter(call => call.start !== undefined)) assert.deepEqual(call.orders, [...APPLICATION_BACKUP_TABLES.find(table => table.name === call.table).key]);
});

test("an empty application table is preserved as an array", async () => {
  const { client, data } = fixture(); data.players = [];
  assert.deepEqual((await collectApplicationBackup(client, "admin")).players, []);
});

for (const scenario of ["nullData", "nullCount", "truncated", "duplicate", "changed", "finalChanged", "switchedUser"]) {
  test(`backup fails without returning a partial payload: ${scenario}`, async () => {
    await assert.rejects(collectApplicationBackup(fixture({ [scenario]: true }).client, "admin"));
  });
}
test("late-table access errors fail the entire export", async () => {
  await assert.rejects(collectApplicationBackup(fixture({ errorTable: "venues" }).client, "admin"));
});
test("admin MFA is required and a different signed-in user cannot export", async () => {
  await assert.rejects(collectApplicationBackup(fixture({ aal: "aal1" }).client, "admin"));
  await assert.rejects(collectApplicationBackup(fixture().client, "other"));
});
