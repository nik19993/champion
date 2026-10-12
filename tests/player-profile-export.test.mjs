import test from "node:test";
import assert from "node:assert/strict";
import { assessmentDate, assessmentLabel, playerProfileHistory, profileExportRange } from "../lib/domain/player-profile-report.ts";

test("only explicit valid dates become assessment dates", () => {
  assert.equal(assessmentDate("20.09.2026"), "2026-09-20");
  assert.equal(assessmentDate("2024-02-29"), "2024-02-29");
  assert.equal(assessmentLabel("2026-09-20"), "20.09.2026");
  for (const value of [null, "", "2026-02-29", "31.04.2026", "2026-09", "І півріччя 2026", "2026-09-20T12:00:00Z", 45920]) assert.equal(assessmentDate(value), null);
});
test("three assessments are chronological columns with zero and missing results distinct", () => {
  const history = playerProfileHistory([
    { measured_on: "2026-09-20", metric_name: "Біг 20 м", value: "4,06", unit: "с" },
    { measured_on: "2025-09-15", metric_name: "Біг 20 м", value: "4,32", unit: "с" },
    { measured_on: "2026-03-15", metric_name: "Фламінго", value: 0, unit: "разів" },
  ], [{ period: "20.09.2026", metric_name: "Лідерські якості", value: "4" }, { period: "2025-09-15", metric_name: "Лідерські якості", value: "2" }], { mode: "all" });
  assert.deepEqual(history.physical.columns, ["15.09.2025", "15.03.2026", "20.09.2026"]);
  assert.deepEqual(history.physical.rows[0].values, ["4,32", "—", "4,06"]);
  assert.deepEqual(history.physical.rows[1].values, ["—", "0", "—"]);
  assert.deepEqual(history.activity.columns, ["15.09.2025", "20.09.2026"]);
});
test("historic periods survive without an invented date, and filtered exports disclose them", () => {
  const legacy = [{ period: "І півріччя 2026", metric_name: "Лідерські якості", value: "3" }];
  const all = playerProfileHistory([], legacy, { mode: "all" });
  assert.deepEqual(all.activity.columns, []);
  assert.deepEqual(all.legacyActivity.columns, ["І півріччя 2026"]);
  assert.equal(assessmentLabel(legacy[0].period), legacy[0].period);
  const filtered = playerProfileHistory([], legacy, { mode: "year", year: "2026" });
  assert.equal(filtered.undatedExcluded, 1);
  assert.deepEqual(filtered.legacyActivity.columns, []);
});
test("year and date range filters include their boundaries without changing source history", () => {
  const tests = ["2025-12-31", "2026-01-01", "2026-12-31", "2027-01-01"].map((date) => ({ measured_on: date, metric_name: "Тест", value: "5" }));
  const copy = structuredClone(tests);
  assert.deepEqual(playerProfileHistory(tests, [], { mode: "year", year: "2026" }).physical.columns, ["01.01.2026", "31.12.2026"]);
  assert.deepEqual(playerProfileHistory(tests, [], { mode: "range", from: "2025-12-31", to: "2026-01-01" }).physical.columns, ["31.12.2025", "01.01.2026"]);
  assert.deepEqual(tests, copy);
  assert.throws(() => profileExportRange({ mode: "range", from: "2026-09-20", to: "2026-03-15" }));
  assert.throws(() => profileExportRange({ mode: "year", year: "26" }));
});
test("different components, units and conflicting duplicate values are not overwritten", () => {
  const tests = [
    { measured_on: "2026-09-20", metric_name: "Тест 505", field_name: "Справа", unit: "с", value: "2,9" },
    { measured_on: "2026-09-20", metric_name: "Тест 505", field_name: "Зліва", unit: "с", value: "3,1" },
    { measured_on: "2026-09-20", metric_name: "Тест 505", field_name: "Справа", unit: "с", value: "2,9" },
    { measured_on: "2026-09-20", metric_name: "Тест 505", field_name: "Справа", unit: "с", value: "3,0" },
  ];
  const rows = playerProfileHistory(tests, [], { mode: "all" }).physical.rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].values[0], "2,9 / 3,0");
  assert.equal(rows[1].values[0], "3,1");
});
test("nullable and empty history produces a valid empty report", () => {
  const empty = playerProfileHistory([], [], { mode: "all" });
  assert.deepEqual(empty.physical.rows, []);
  const legacy = playerProfileHistory([{ measured_on: null, metric_name: null, value: null }], [{ period: null, metric_name: null, value: null }], { mode: "all" });
  assert.equal(legacy.legacyPhysical.rows[0].values[0], "—");
  assert.equal(legacy.legacyActivity.rows[0].values[0], "—");
});
