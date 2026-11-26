// Synthetic data only; no real accounts or external requests.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { AdminCalendar } from "../../components/admin/admin-calendar";
import { kyivDateKey } from "../../lib/domain/format";

const day = kyivDateKey(new Date());
const groups = [
  { id: "main", code: "U12A", group_kind: "age" },
  { id: "keeper", code: "Воротарі A", group_kind: "goalkeeper" },
  { id: "location2", code: "Локація № 2 A", group_kind: "location", location: { venue_id: "school2" } },
  { id: "location15", code: "Локація № 15 Junior", group_kind: "location", location: { venue_id: "school15" } },
];
const venues = [
  { id: "field1", name: "Поле 1", is_active: true, parent_venue_id: null, venue_type: "field" },
  { id: "school2", name: "Зал школи № 2", is_active: true, parent_venue_id: null, venue_type: "hall" },
  { id: "school15", name: "Зал школи № 15", is_active: true, parent_venue_id: null, venue_type: "hall" },
];
function event(id, groupIndex, coachId, coachName, hour, venueIndex, extra = {}) {
  return { id, group_id: groups[groupIndex].id, groups: groups[groupIndex], coach_id: coachId, coach: { full_name: coachName },
    event_type: "training", status: "scheduled", start_at: `${day}T${hour}:00:00Z`, ends_at: `${day}T${hour}:50:00Z`,
    venue_id: venues[venueIndex].id, booking_venue_id: venues[venueIndex].id, venues: venues[venueIndex], venue_part: "whole", ...extra };
}
const qa = { calls: [], opened: null, fail: false, events: [
  event("main-event", 0, "shared-coach", "Тренер двох напрямів", "08", 0),
  event("keeper-event", 1, "keeper-coach", "Тренер воротарів", "09", 0),
  event("location-event", 2, "shared-coach", "Тренер двох напрямів", "10", 1),
  event("junior-event", 3, "location-coach", "Тренер локацій", "11", 2),
  event("cancelled-location", 3, "location-coach", "Тренер локацій", "12", 2, { status: "cancelled", coach_comment: null }),
] };
window.adminCalendarQa = qa;
class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; }
  eq(key, value) { this.filters.push(row => row[key] === value); return this; }
  neq(key, value) { this.filters.push(row => row[key] !== value); return this; }
  is(key, value) { return this.eq(key, value); }
  gte(key, value) { this.filters.push(row => row[key] >= value); return this; }
  lt(key, value) { this.filters.push(row => row[key] < value); return this; }
  order() { return this; }
  range(start, end) { this.start = start; this.end = end; return this; }
  then(ok, fail) { return Promise.resolve().then(() => {
    qa.calls.push({ table: this.table, operation: "read" });
    if (qa.fail && this.table === "events") return { data: null, error: Error("Synthetic offline failure"), count: null };
    const rows = (this.table === "events" ? qa.events : venues).filter(row => this.filters.every(filter => filter(row)));
    return { data: structuredClone(this.start == null ? rows : rows.slice(this.start, this.end + 1)), error: null, count: rows.length };
  }).then(ok, fail); }
}
const client = { from: table => new Query(table) };
function Fixture() {
  const [revision, setRevision] = useState(0);
  qa.refresh = () => setRevision(value => value + 1);
  qa.addLocationEvent = () => { qa.events.push(event("new-location-event", 2, "shared-coach", "Тренер двох напрямів", "13", 1)); qa.refresh(); };
  return <AdminCalendar client={client} groups={groups} revision={revision} onOpenEvent={id => { qa.opened = id; }} />;
}
createRoot(document.getElementById("root")).render(<Fixture />);
