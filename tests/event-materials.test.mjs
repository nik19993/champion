import test from "node:test";
import assert from "node:assert/strict";
import { loadEventMaterials, attachEventMaterial } from "../lib/supabase/event-materials.ts";
import { trainingDocumentType, TRAINING_DOCUMENT_LIMIT } from "../lib/domain/training-document.ts";

const asset = { id: "document-a", scan_status: "clean", original_name: "План заняття.pdf" };
function reader(results) {
  const calls = [];
  return { calls, client: { from(table) {
    const call = { table, filters: {} }; calls.push(call);
    return { select() { return this; }, eq(key, value) { call.filters[key] = value; return this; }, then(ok, fail) { return Promise.resolve(results[table]).then(ok, fail); } };
  } } };
}
test("a fresh read restores event and task documents, deduplicates links and excludes unvalidated files", async () => {
  for (let reopening = 0; reopening < 2; reopening++) {
    const { client, calls } = reader({
      event_materials: { data: [{ file_assets: asset }, { file_assets: { id: "pending", scan_status: "pending" } }] },
      methodology_materials: { data: [{ file_assets: [asset, { ...asset, id: "document-b" }] }, { file_assets: null }] },
    });
    assert.deepEqual((await loadEventMaterials(client, "event-a", "task-a")).map(row => row.id), ["document-a", "document-b"]);
    assert.deepEqual(calls.map(call => call.filters), [{ event_id: "event-a" }, { task_id: "task-a" }]);
  }
});
test("a failed material read never becomes an empty-document success", async () => {
  const { client } = reader({ event_materials: { data: null, error: Error("offline") } });
  await assert.rejects(loadEventMaterials(client, "event-a", null), /offline/);
});

for (const taskId of ["task-a", null]) {
  test(`attachment confirms its persisted event link: ${taskId ?? "custom task"}`, async () => {
    const { client, calls } = reader({ event_materials: { data: { file_asset_id: asset.id } } });
    client.from = ((from) => (table) => Object.assign(from(table), { maybeSingle() { return this; } }))(client.from);
    client.rpc = async (name, args) => {
      assert.equal(name, taskId ? "attach_event_task_material" : "attach_event_material");
      assert.equal(args.p_event_id, "event-a"); assert.equal(args.p_file_asset_id, asset.id);
      if (taskId) assert.equal(args.p_task_id, taskId);
      return { error: { message: "response lost after commit" } };
    };
    await attachEventMaterial(client, "event-a", taskId, asset.id);
    assert.deepEqual(calls[0].filters, { event_id: "event-a", file_asset_id: asset.id });
  });
}
test("an RPC success without a persisted link cannot report attachment success", async () => {
  const { client } = reader({ event_materials: { data: null } });
  client.from = ((from) => (table) => Object.assign(from(table), { maybeSingle() { return this; } }))(client.from);
  client.rpc = async () => ({ error: null });
  await assert.rejects(attachEventMaterial(client, "event-a", "task-a", asset.id), /не підтверджено/);
});
test("document MIME comes from a supported extension even when the browser omits it", () => {
  assert.equal(trainingDocumentType({ name: "План.DOCX", size: 1024 }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(trainingDocumentType({ name: "план.pdf", size: TRAINING_DOCUMENT_LIMIT }), "application/pdf");
  assert.throws(() => trainingDocumentType({ name: "план.doc", size: 1024 }), /\.docx або PDF/);
  assert.throws(() => trainingDocumentType({ name: "план.pdf", size: TRAINING_DOCUMENT_LIMIT + 1 }), /20 МБ/);
  assert.throws(() => trainingDocumentType({ name: "план.pdf", size: 0 }), /порожній/);
});
