import test from "node:test";
import assert from "node:assert/strict";
import { uploadPrivateFile } from "../lib/supabase/files.ts";

function fixture(mode = "normal") {
  const calls = [];
  let asset;
  class Query {
    insert(row) { this.row = row; this.op = "insert"; calls.push("insert"); return this; }
    select() { this.returning = true; if (!this.op) this.op = "read"; calls.push("read"); return this; }
    delete() { this.op = "delete"; calls.push("delete"); return this; }
    eq(key, value) { this.id = value; return this; }
    single() { return this; }
    then(resolve, reject) { return Promise.resolve().then(() => {
      if (this.op === "insert") {
        // Models the real stable RLS helper's INSERT RETURNING snapshot.
        if (this.returning || mode === "denied") return { data: null, error: new Error("RLS denied") };
        asset = { ...this.row, scan_status: "pending" };return { data: null, error: null };
      }
      if (this.op === "delete") { asset = undefined;return { data: null, error: null }; }
      return { data: mode === "missing" ? null : mode === "wrong" ? { ...asset, id: "other" } : asset, error: null };
    }).then(resolve, reject); }
  }
  return { calls, client: {
    from: () => new Query(),
    storage: { from: () => ({ upload: async () => { calls.push("upload");return { error: null }; }, remove: async () => { calls.push("remove");return { error: null }; } }) },
    functions: { invoke: async () => { calls.push("validate");return { data: { status: mode === "invalid" ? "rejected" : "clean" }, error: null }; } },
  } };
}
const file = new File(["synthetic"], "test.pdf", { type: "application/pdf" });
const context = { bucket: "task-documents", ownerId: "synthetic-coach", groupId: "synthetic-group", age: 12, contextType: "event_task" };
test("task registration confirms a separate RLS-protected read before validation", async () => {
  const { client, calls } = fixture();
  const asset = await uploadPrivateFile(client, file, context);
  assert.deepEqual(calls, ["upload", "insert", "read", "validate"]);
  assert.equal(asset.context_age, 12);assert.equal(asset.scan_status, "clean");assert.ok(asset.id);
});
for (const mode of ["denied", "missing", "wrong", "invalid"]) {
  test(`failed task registration/validation cleans uploaded bytes: ${mode}`, async () => {
    const { client, calls } = fixture(mode);
    await assert.rejects(uploadPrivateFile(client, file, context));
    assert.ok(calls.includes("remove"));
    if (mode !== "denied") assert.ok(calls.includes("delete"));
    if (mode !== "invalid") assert.ok(!calls.includes("validate"));
  });
}
