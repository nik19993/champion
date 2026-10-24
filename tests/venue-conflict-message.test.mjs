import test from "node:test";
import assert from "node:assert/strict";
import { venueConflictMessage } from "../lib/supabase/venue-conflict-message.ts";

const row = {venue_part:"left",start_at:"2026-10-24T13:00:00Z",ends_at:"2026-10-24T14:00:00Z",group_code:"U13A"};
const args = ["field-id","2026-10-24T13:00:00Z",60,"left","edited-event","Original server error"];
test("a booking taken since the last poll reports the occupied half, group and Kyiv time", async () => {
  const client = {rpc:async(name, params) => {
    assert.equal(name,"venue_booking_conflicts");
    assert.deepEqual(params,{p_venue_id:"field-id",p_start_at:args[1],p_duration_minutes:60,p_exclude_event_id:"edited-event"});
    return {data:[row,{...row,venue_part:"right",group_code:"U9A"}],error:null};
  }};
  const message = await venueConflictMessage(client,...args);
  assert.match(message,/Ліва половина/); assert.match(message,/U13A/); assert.match(message,/16:00/); assert.match(message,/17:00/);
  assert.doesNotMatch(message,/U9A/);
});
test("unavailable conflict details never hide the original save error", async () => {
  for(const result of [{data:null,error:Error()},{data:[],error:null},{data:[{...row,venue_part:"right"}],error:null}]) {
    assert.equal(await venueConflictMessage({rpc:async()=>result},...args),args.at(-1));
  }
  assert.equal(await venueConflictMessage({rpc:async()=>{throw Error();}},...args),args.at(-1));
});
