import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { groupCode, groupLabel, parseSeason, previewSeason, seasonName } from "../lib/domain/seasons.ts";
import { isMissingResult, normalizeBirthDate, planPlayerCompletion } from "../lib/domain/player-import.ts";
import { MONTHLY_STAR_MARK_DATA_URL } from "../lib/domain/monthly-star-award-assets.ts";
import { awardDisplayName } from "../lib/domain/monthly-star-award-pdf.ts";

test("season labels follow the selected season, preserving the birth cohort and group identity", () => {
  const groups = [{ id: "stable-id", code: "U11A", age: 11, team_suffix: "A", group_kind: "age", cohort_birth_year: 2016 }];
  const original = structuredClone(groups);
  assert.deepEqual(previewSeason(groups, 2026), [{ id: "stable-id", previous: "U11A", next: "U11A", birthYear: 2016, age: 11 }]);
  assert.equal(previewSeason(groups, 2027)[0].next, "U12A");
  assert.deepEqual(groups, original);
  assert.equal(groupLabel({ ...groups[0], display_code: "U12A" }), "U12A · 2016 р.н.");
  assert.equal(previewSeason([{ ...groups[0], group_kind: "goalkeeper" }], 2027).length, 0);
  assert.equal(previewSeason([{ ...groups[0], cohort_birth_year: null }], 2027)[0].next, null);
});

test("season parsing requires two consecutive explicit years", () => {
  assert.equal(seasonName(2026), "2026/2027");
  assert.equal(parseSeason("2026/2027"), 2026);
  for (const invalid of [null, "2026", "2026/2028", "2026/27", ""]) assert.equal(parseSeason(invalid), null);
});

test("group labels tolerate nullable and array relations", () => {
  assert.equal(groupCode(null), "—");
  assert.equal(groupCode([]), "—");
  assert.equal(groupCode([{ code: "U11A", display_code: "U12A" }]), "U12A");
});

test("full birth dates validate actual calendar days without inventing dates from years", () => {
  assert.equal(normalizeBirthDate("29.02.2016"), "2016-02-29");
  assert.equal(normalizeBirthDate("2016-02-29"), "2016-02-29");
  for (const invalid of ["2016", "29.02.2015", "31.04.2016", "2016-13-01", ""]) assert.equal(normalizeBirthDate(invalid), null);
});

test("missing test values are skipped while zero is a recorded result", () => {
  for (const value of [undefined, null, "", " ", "-", "–", "—"]) assert.equal(isMissingResult(value), true);
  for (const value of ["0", "0.00", "5.8"]) assert.equal(isMissingResult(value), false);
});

test("repeat imports fill blanks, preserve existing values and surface conflicts", () => {
  const existing = { birth_date: null, birth_year: 2016, position: "", dominant_foot: "ліва" };
  assert.deepEqual(planPlayerCompletion(existing, { position: "Воротар", birth_year: "2016", dominant_foot: "" }), { updates: { position: "Воротар" }, conflicts: [] });
  assert.deepEqual(planPlayerCompletion(existing, { birth_date: "2016-10-01", birth_year: "2015", dominant_foot: "права" }), { updates: { birth_date: "2016-10-01" }, conflicts: ["birth_year", "dominant_foot"] });
  assert.equal(existing.position, "");
});

test("award uses the exact supplied five-figure star and the topic title without a prefix", async () => {
  const png = await readFile(new URL("../public/champion-star-figures.png", import.meta.url));
  const embedded = Buffer.from(MONTHLY_STAR_MARK_DATA_URL.split(",")[1], "base64");
  assert.deepEqual(embedded, png);
  const generator = await readFile(new URL("../lib/domain/monthly-star-award-pdf.ts", import.meta.url), "utf8");
  assert.doesNotMatch(generator, /ТЕМА МІСЯЦЯ:/);
});

test("award caption omits the patronymic while preserving surname and given name", () => {
  assert.equal(awardDisplayName("Коваль Марко Андрійович"), "Коваль Марко");
  assert.equal(awardDisplayName("  Коваль-Гнатюк\tМарко-Іван   Андрійович "), "Коваль-Гнатюк Марко-Іван");
  assert.equal(awardDisplayName("Яцик Дем’ян"), "Яцик Дем’ян");
  assert.equal(awardDisplayName("Широкий"), "Широкий");
});
