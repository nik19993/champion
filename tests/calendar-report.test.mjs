import test from "node:test";
import assert from "node:assert/strict";
import { durationInput, durationMinutes } from "../lib/domain/event-duration.ts";
import { operationalReportRow } from "../lib/domain/operational-report.ts";

test("clearing and retyping duration does not insert a leading zero", () => {
  assert.equal(durationInput(""), "");
  assert.equal(durationInput("060"), "60");
  assert.equal(durationInput("00075"), "75");
  assert.equal(durationInput(60), "60"); // Drafts created by the old frontend.
  assert.equal(durationInput(null), "");
});

test("duration is validated as integer minutes without clock or scientific formats", () => {
  for (const value of ["", "0", "14", "361", "1e2", "60.5", "0:60", "-60"]) assert.equal(durationMinutes(value), null);
  for (const value of ["15", "60", "360"]) assert.equal(durationMinutes(value), Number(value));
});

const item = {
  id: "report-fixture", group_id: "group-a", item_type: "comment", status: "todo", title: "Коментар тренера",
  created_at: "2026-10-01T10:00:00Z", due_at: "2026-10-08T12:00:00Z",
  comment: "Потрібно замовити автобус на 20 місць.\nВиїзд о 08:30.",
  groups: { code: "U11A", display_code: "U12A", cohort_birth_year: 2016 },
  creator: { full_name: "Адміністратор", role: "admin" },
  events: { start_at: "2026-10-09T14:00:00Z", event_type: "tournament", coach: { full_name: "Тестовий тренер" }, venues: { name: "Тестове поле" }, title: "Турнір групи" },
};

test("report shows the exact comment, actual event date, cohort and named coach", () => {
  const row = operationalReportRow(item);
  assert.equal(row.action, item.comment);
  assert.equal(row.group, "U12A · 2016");
  assert.equal(row.coach, "Тестовий тренер");
  assert.match(row.date, /09\.10\.2026/);
  assert.match(row.context, /Турнір.*Турнір групи.*Тестове поле/);
});

test("report accepts array relations and identifies an appointed substitute", () => {
  const row = operationalReportRow({ ...item, groups: [item.groups], events: [{ ...item.events, coach: [item.events.coach], substitute: [{ full_name: "Тренер на заміну" }], venues: [item.events.venues], status: "cancelled" }] });
  assert.equal(row.coach, "Тренер на заміну");
  assert.match(row.context, /Скасовано/);
  assert.equal(row.group, "U12A · 2016");
});

test("missing report relations never identify the administrator as a coach", () => {
  const row = operationalReportRow({ ...item, groups: null, events: null, comment: null });
  assert.equal(row.coach, "Тренера не вказано");
  assert.equal(row.context, "Подію не прив’язано");
  assert.equal(row.group, "Групу не вказано");
  assert.equal(row.action, "Конкретний коментар не вказано.");
  assert.match(row.date, /08\.10\.2026/);
});

test("organizational needs and substitution reports describe the concrete work", () => {
  const needs = operationalReportRow({ ...item, item_type: "organizational_need", comment: "Автобус; Лікар; Інше: питна вода" });
  assert.equal(needs.action, "Підготувати: Автобус; Лікар; Інше: питна вода");
  const substitution = operationalReportRow({ ...item, item_type: "coach_substitution", comment: "Основний тренер на навчанні." });
  assert.equal(substitution.action, "Знайти та призначити тренера на заміну.\nОсновний тренер на навчанні.");
});

test("a standalone coach comment retains its author and full text", () => {
  const row = operationalReportRow({ ...item, events: [], creator: [{ full_name: "Автор коментаря", role: "coach" }] });
  assert.equal(row.coach, "Автор коментаря");
  assert.equal(row.action, item.comment);
});
