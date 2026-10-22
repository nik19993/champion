import test from "node:test";
import assert from "node:assert/strict";
import { contentVersions, readContentRows } from "../lib/domain/content-batch.ts";

function clientFor(pages) {
  let page = 0;
  const calls = [];
  return { calls, from(table) {
    assert.ok(["methodology_tasks", "terminology_entries"].includes(table));
    return { select() { return this; }, order(key) { assert.equal(key,"id"); return this; }, range(start,end) {
      calls.push([start,end]); return Promise.resolve(pages[page++]);
    }};
  }};
}
test("bulk snapshot preserves exact server timestamps and only expected fields", () => {
  const timestamp="2026-10-22T18:20:30.123456+00:00";
  assert.deepEqual(contentVersions([{id:"task",updated_at:timestamp,title:"hidden"}]),[{id:"task",updated_at:timestamp}]);
  assert.throws(()=>contentVersions([{id:"task",updated_at:""}]));
});
test("bulk list reads all rows beyond the API page size", async () => {
  const first=Array.from({length:500},(_,i)=>({id:String(i)}));
  const client=clientFor([{data:first,count:501,error:null},{data:[{id:"last"}],count:501,error:null}]);
  assert.equal((await readContentRows(client,"tasks")).length,501);
  assert.deepEqual(client.calls,[[0,499],[500,999]]);
});
test("bulk list rejects count drift, repeated IDs, missing pages and denied reads", async () => {
  for(const pages of [
    [{data:[{id:"one"}],count:2},{data:[{id:"two"}],count:3}],
    [{data:[{id:"one"}],count:2},{data:[{id:"one"}],count:2}],
    [{data:[{id:"one"}],count:2},{data:[],count:2}],
    [{data:null,count:null,error:{code:"42501"}}],
  ]) await assert.rejects(readContentRows(clientFor(pages),"terminology"));
});
test("an empty current list is a valid bulk snapshot", async () => {
  assert.deepEqual(await readContentRows(clientFor([{data:[],count:0,error:null}]),"tasks"),[]);
});
