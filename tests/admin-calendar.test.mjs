import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  adminCalendarRange, calendarEventsByDay, calendarMonthCells, calendarRangeLabel, filterCalendarEvents, shiftCalendarAnchor,
} from "../lib/domain/admin-calendar.ts";
import { loadAdminCalendarEvents } from "../lib/supabase/admin-calendar.ts";

test("the seven-day and ten-day views include today and month navigation uses calendar months", () => {
  assert.deepEqual(adminCalendarRange("2026-11-09", "7"), { start: "2026-11-09", end: "2026-11-16" });
  assert.deepEqual(adminCalendarRange("2026-11-09", "10"), { start: "2026-11-09", end: "2026-11-19" });
  assert.equal(shiftCalendarAnchor("2026-11-09", "10", 1), "2026-11-19");
  const month = adminCalendarRange("2026-11-09", "month");
  assert.deepEqual(month, { start: "2026-11-01", end: "2026-12-01" });
  assert.equal(shiftCalendarAnchor("2026-12-31", "month", 1), "2027-01-01");
  const cells = calendarMonthCells(month);
  assert.equal(cells.length % 7, 0);
  assert.equal(cells[6], "2026-11-01");
  assert.equal(cells.filter(Boolean).length, 30);
  assert.match(calendarRangeLabel(adminCalendarRange("2026-12-28", "7"), "7"), /2026.*2027/);
});

function event(id, fields = {}) {
  return {
    id, group_id: "u10a", event_type: "training", start_at: "2026-11-09T13:00:00.000Z", ends_at: "2026-11-09T14:00:00.000Z",
    coach_id: "coach-a", substitute_coach_id: null, venue_id: "field-left", booking_venue_id: "field",
    status: "scheduled", coach: null, substitute: null, ...fields,
  };
}

test("the calendar keeps each event once and filters both coach roles and all parts of a field", () => {
  const rows = [
    event("later", { start_at: "2026-11-09T16:00:00.000Z", is_rescheduled: true }),
    event("cancelled", { status: "cancelled" }),
    event("substitution", { coach_id: "coach-b", substitute_coach_id: "coach-a" }),
    event("different-group", { group_id: "u11b" }),
    event("different-type", { event_type: "theory" }),
    event("kyiv-next-day", { start_at: "2026-11-09T22:30:00.000Z", ends_at: "2026-11-09T23:30:00.000Z" }),
  ];
  const filters = { groupId: "u10a", coachId: "coach-a", type: "training", venueId: "field", includeCancelled: false };
  const days = calendarEventsByDay(filterCalendarEvents(rows, filters));
  assert.deepEqual([...days].map(([day, events]) => [day, events.map(({ id }) => id)]), [
    ["2026-11-09", ["substitution", "later"]],
    ["2026-11-10", ["kyiv-next-day"]],
  ]);
  assert(filterCalendarEvents(rows, { ...filters, includeCancelled: true }).some(({ id }) => id === "cancelled"));
});

function fixtureClient(fetch) {
  return createClient("https://calendar-fixture.example", "local-fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
}

function page(rows, offset, total) {
  return new Response(JSON.stringify(rows), { headers: {
    "Content-Type": "application/json",
    "Content-Range": rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`,
  } });
}

test("the calendar requests Kyiv midnight boundaries across the clock change and reads every page", async () => {
  const range = adminCalendarRange("2026-10-25", "7");
  const events = ["first", "second", "third"].map((id) => event(id, {
    start_at: "2026-10-25T12:00:00.000Z", ends_at: "2026-10-25T13:00:00.000Z",
  }));
  const offsets = [];
  const client = fixtureClient(async (input) => {
    const { pathname, searchParams } = new URL(input);
    assert.equal(pathname, "/rest/v1/events");
    assert.deepEqual(searchParams.getAll("start_at"), ["gte.2026-10-24T21:00:00.000Z", "lt.2026-10-31T22:00:00.000Z"]);
    assert.equal(searchParams.get("order"), "start_at.asc,id.asc");
    assert(!searchParams.has("status"), "cancelled events are available when the administrator enables them");
    const offset = Number(searchParams.get("offset"));
    offsets.push(offset);
    return page(events.slice(offset, offset + 1), offset, events.length);
  });
  assert.deepEqual(await loadAdminCalendarEvents(client, range), events);
  assert.deepEqual(offsets, [0, 1, 2]);
});

test("an interrupted calendar load cannot return a misleading partial schedule", async () => {
  const client = fixtureClient(async (input) => {
    const offset = Number(new URL(input).searchParams.get("offset"));
    return offset ? page([], offset, 2) : page([event("first")], offset, 2);
  });
  await assert.rejects(loadAdminCalendarEvents(client, adminCalendarRange("2026-11-09", "7")), /Повторіть спробу/);
});
