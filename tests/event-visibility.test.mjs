import assert from "node:assert/strict";
import test from "node:test";
import { eventIsVisible, operationalItemIsVisible } from "../lib/domain/event-visibility.ts";
import { operationalReportRow } from "../lib/domain/operational-report.ts";

test("cancelling a lesson removes its preparation requests and keeps a coach message", () => {
  const event = { start_at: "2026-11-23T15:00:00Z", event_type: "training", status: "cancelled", coach_comment: "  " };
  assert.equal(eventIsVisible(event), false);
  assert.equal(eventIsVisible({ ...event, coach_comment: "Узгодьте повернення коштів за зал." }), true);
  assert.equal(operationalItemIsVisible({ item_type: "organizational_need", comment: "Відкрити зал", events: event }), false);
  assert.equal(operationalItemIsVisible({ item_type: "coach_substitution", comment: null, events: [event] }), false);
  assert.equal(operationalItemIsVisible({ item_type: "comment", comment: "Узгодьте повернення коштів за зал.", events: event }), true);
});

test("a rescheduled lesson stays in the calendar and its coach message appears once in the report", () => {
  const event = {
    start_at: "2026-11-24T15:00:00Z", event_type: "training", status: "scheduled",
    coach_comment: "Допоможіть погодити майданчик.",
  };
  const fields = { group_id: "group", event_id: "event", status: "todo", created_at: "2026-11-23T12:00:00Z", events: event };
  const items = [
    { ...fields, id: "automatic", item_type: "reschedule", title: "Подію перенесено", comment: "2026-11-23 → 2026-11-24" },
    { ...fields, id: "message", item_type: "comment", title: "Коментар тренера", comment: event.coach_comment },
  ];
  const shown = items.filter(operationalItemIsVisible);
  assert.equal(eventIsVisible(event), true);
  assert.deepEqual(shown.map(({ id }) => id), ["message"]);
  assert.equal(operationalReportRow(shown[0]).action, event.coach_comment);
  assert.equal(operationalItemIsVisible({ ...items[0], events: { ...event, coach_comment: null } }), false);
});
