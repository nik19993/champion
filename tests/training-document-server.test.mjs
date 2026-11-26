// Executes the deployed validator's handler against an in-memory service.
// No real Auth identities, tokens, Storage objects or network requests are used.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

let handler;
const source = await readFile(new URL("../supabase/functions/file-validate/index.ts", import.meta.url), "utf8");
const prepared = source
  .replace('import { corsHeaders, json } from "../_shared/http.ts";', `import { corsHeaders, json } from ${JSON.stringify(new URL("../supabase/functions/_shared/http.ts", import.meta.url).href)};`)
  .replace('import { requireActiveUser } from "../_shared/user.ts";', "const requireActiveUser = async () => globalThis.validationFixture;");
globalThis.Deno = { serve(value) { handler = value; } };
await import("data:text/javascript;base64," + Buffer.from(stripTypeScriptTypes(prepared)).toString("base64"));
delete globalThis.Deno;

async function validate({ metadataSize, actualSize = metadataSize, bucket = "task-documents", mime = "application/pdf" }) {
  const calls = [], asset = { id: "synthetic-file", owner_id: "synthetic-coach", bucket, object_path: "synthetic-only", size_bytes: metadataSize, mime_type: mime, scan_status: "pending" };
  const bytes = new Uint8Array(actualSize);
  bytes.set(mime === "image/jpeg" ? [0xff, 0xd8, 0xff] : [0x25, 0x50, 0x44, 0x46, 0x2d]);
  globalThis.validationFixture = { userId: asset.owner_id, service: {
    from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: asset, error: null }), update(values) { calls.push({ update: values }); return { eq() { return this; }, then(ok, fail) { return Promise.resolve({ error: null }).then(ok, fail); } }; } }),
    storage: { from: () => ({ download: async () => { calls.push({ download: true }); return { data: new Blob([bytes]), error: null }; }, remove: async () => { calls.push({ remove: true }); return { error: null }; } }) },
  } };
  try {
    const response = await handler(new Request("https://synthetic.test/validate", { method: "POST", body: JSON.stringify({ file_asset_id: asset.id }) }));
    return { status: response.status, data: await response.json(), calls };
  } finally { delete globalThis.validationFixture; }
}
test("the server accepts a document exactly at the 1 MB boundary", async () => {
  const result = await validate({ metadataSize: 1_000_000 });
  assert.equal(result.status, 200); assert.equal(result.data.status, "clean");
  assert.ok(result.calls.some(call => call.update?.scan_status === "clean"));
});
test("the server rejects a document one byte above the boundary before downloading it", async () => {
  const result = await validate({ metadataSize: 1_000_001 });
  assert.equal(result.data.status, "rejected"); assert.equal(result.data.reason, "TYPE_OR_SIZE_REJECTED");
  assert.ok(result.calls.some(call => call.remove)); assert.ok(!result.calls.some(call => call.download));
});
test("spoofing the metadata size cannot validate larger stored bytes", async () => {
  const result = await validate({ metadataSize: 500_000, actualSize: 1_000_001 });
  assert.equal(result.data.status, "rejected"); assert.equal(result.data.reason, "SIGNATURE_MISMATCH");
});
test("the training-document limit leaves the existing player-photo limit intact", async () => {
  const result = await validate({ metadataSize: 2_000_000, bucket: "player-photos", mime: "image/jpeg" });
  assert.equal(result.data.status, "clean");
});
