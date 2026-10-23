import test from "node:test";
import assert from "node:assert/strict";
import {venueOccupiedIntervals,venueFreeIntervals} from "../lib/domain/venue-occupancy.ts";
const hour=3600000,start=Date.parse("2026-10-23T06:00:00Z"),end=start+12*hour;
const event=(part,from,to,extra={})=>({id:part+from,venue_id:"field",booking_venue_id:"field",venue_part:part,status:"scheduled",start_at:new Date(start+from*hour).toISOString(),ends_at:new Date(start+to*hour).toISOString(),...extra});
test("whole-field availability is blocked by either half while opposite halves stay independent",()=>{
 const rows=[event("left",1,2)];
 assert.equal(venueOccupiedIntervals(rows,"field","whole",start,end).length,1);
 assert.equal(venueOccupiedIntervals(rows,"field","right",start,end).length,0);
 assert.equal(venueOccupiedIntervals([event("whole",1,2)],"field","right",start,end).length,1);
});
test("merged, adjacent and clipped bookings produce exact free windows",()=>{
 const occupied=venueOccupiedIntervals([event("left",-1,1),event("right",0.5,2),event("whole",2,3),event("left",10,14)],"field","whole",start,end);
 assert.deepEqual(venueFreeIntervals(occupied,start,end,60),[{start:start+3*hour,end:start+10*hour}]);
});
test("duration filters preserve exact boundaries without hiding shorter availability from another half",()=>{
 assert.equal(venueFreeIntervals([{start:start+hour,end}],start,end,60).length,1);
 assert.equal(venueFreeIntervals([{start:start+hour,end}],start,end,61).length,0);
 assert.deepEqual(venueFreeIntervals([],start,end,60),[{start,end}]);
});
test("legacy child venues resolve to the parent and inactive events do not reserve it",()=>{
 const rows=[event("left",1,2,{venue_id:"legacy-half"}),event("right",2,3,{status:"cancelled"}),event("whole",3,4,{status:"completed"})];
 assert.equal(venueOccupiedIntervals(rows,"field","whole",start,end).length,1);
 assert.equal(venueOccupiedIntervals(rows,"other","whole",start,end).length,0);
});
test("invalid intervals fail instead of claiming a free venue",()=>{
 assert.throws(()=>venueOccupiedIntervals([event("left",1,2,{ends_at:null})],"field","left",start,end));
 assert.throws(()=>venueFreeIntervals([],end,start));
});
