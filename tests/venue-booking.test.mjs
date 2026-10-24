import test from "node:test";
import assert from "node:assert/strict";
import { effectiveVenuePart, eventVenueLabel, venuePartsOverlap, venueSupportsHalves } from "../lib/domain/venue-booking.ts";
import { safeError } from "../lib/domain/format.ts";
import { operationalReportRow } from "../lib/domain/operational-report.ts";

test("whole blocks each half while separate halves can coexist", () => {
  const parts = ["whole", "left", "right"];
  const expected = [[true,true,true],[true,true,false],[true,false,true]];
  for (let i=0; i<parts.length; i++) for (let j=0; j<parts.length; j++) assert.equal(venuePartsOverlap(parts[i],parts[j]), expected[i][j]);
});
test("every new field supports halves and halls use an explicit setting", () => {
  for (const venue_type of ["field", "small_pitch"]) assert.equal(venueSupportsHalves({venue_type}),true);
  for (const venue_type of ["hall", "other"]) {
    assert.equal(venueSupportsHalves({venue_type}),false);
    assert.equal(venueSupportsHalves({venue_type,supports_half_booking:true}),true);
  }
  assert.equal(venueSupportsHalves(null),false);
});
test("legacy linked halves cannot be booked as a separate whole field", () => {
  assert.equal(effectiveVenuePart({parent_venue_id:"root",venue_part:"left"},"whole"),"left");
  assert.equal(effectiveVenuePart({venue_type:"hall"},"right"),"whole");
  assert.equal(effectiveVenuePart({venue_type:"field"},undefined),"whole");
});
test("labels retain unknown and legacy venue names without duplicate suffixes", () => {
  assert.equal(eventVenueLabel(null,"left"),"Майданчик не вказано");
  assert.equal(eventVenueLabel("Поле 1","right"),"Поле 1 · права половина");
  assert.equal(eventVenueLabel("Поле 1 — ліва половина","left",true),"Поле 1 — ліва половина");
});
test("atomic constraint conflicts produce a readable retry message", () => {
  assert.match(safeError({code:"23P01",message:'conflicting key value violates exclusion constraint "events_venue_booking_excl"'}),/^Конфлікт:.*автоматично/);
  assert.match(safeError({code:"23P01",message:"EVENT_CONFLICT: майданчик зайнятий"}),/^Конфлікт: майданчик/);
});
test("operational report includes the booked half with nullable relations", () => {
  const row=operationalReportRow({item_type:"comment",status:"todo",created_at:"2026-10-11T12:00:00Z",events:[{event_type:"training",start_at:"2026-10-11T14:00:00Z",venue_part:"left",venues:[{name:"Нове поле"}]}]});
  assert.match(row.context,/Нове поле · ліва половина/);
});
