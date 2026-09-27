#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(
  fs.readFileSync(path.join(root, "dist/data/methodology-data.json"), "utf8"),
);
const index = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");
const seed = fs.readFileSync(
  path.join(root, "supabase/seed/20260918_methodology_content.sql"),
  "utf8",
);

const expected = new Map([
  [6, [20, 6]],
  [7, [19, 10]],
  [8, [23, 9]],
  [9, [19, 17]],
  [10, [17, 19]],
  [11, [21, 15]],
  [12, [19, 17]],
  [13, [13, 19]],
  [14, [12, 16]],
  [15, [11, 16]],
]);

assert.equal(data.tasks.length, 318, "The programme must contain 318 tasks");
assert.equal(data.terms.length, 110, "The glossary must contain 110 entries");
assert.equal(new Set(data.tasks.map((item) => item.id)).size, 318, "Task IDs must be unique");
assert.equal(new Set(data.tasks.map((item) => item.dbId)).size, 318, "Task database IDs must be unique");
assert.equal(new Set(data.terms.map((item) => item.dbId)).size, 110, "Term database IDs must be unique");
assert.equal(
  new Set(data.terms.map((item) => `${item.term}|${item.category}`)).size,
  110,
  "Glossary term/category pairs must be unique",
);

for (const [age, [attack, defense]] of expected) {
  assert.equal(data.tasks.filter((item) => item.age === age && item.phase === "attack").length, attack, `U${age} attack count`);
  assert.equal(data.tasks.filter((item) => item.age === age && item.phase === "defense").length, defense, `U${age} defense count`);
}
for (const task of data.tasks) {
  assert.ok(["individual", "group", "team"].includes(task.section), `Invalid task section: ${task.id}`);
  assert.ok(task.component, `Missing component: ${task.id}`);
  assert.match(task.title, /^Навчити\s/u, `Unexpected task wording: ${task.id}`);
}
for (const term of data.terms) {
  assert.ok(term.term && term.english && term.definition && term.category, `Incomplete glossary entry: ${term.id}`);
}

const externalScriptAt = index.indexOf('<script src="data/methodology-data.js"></script>');
const applicationScriptAt = index.indexOf("<script>", externalScriptAt);
assert.ok(externalScriptAt > 0 && applicationScriptAt > externalScriptAt, "Methodology data must load before the application");
assert.match(index, /mergeCanonicalMethodology\(s\)/, "Canonical content migration must run on load");
assert.match(index, /t\.english\|\|''/, "Glossary search must include English equivalents");
assert.match(index, /Тестова версія 0\.2\.6/, "Visible test version must be current");
assert.match(seed, /on conflict \(term, category\)/, "Glossary seed must preserve contextual duplicates");

const inlineMatch = index.match(/<script>\s*([\s\S]*?)<\/script>/u);
assert.ok(inlineMatch, "Application script not found");
new vm.Script(inlineMatch[1], { filename: "index-inline.js" });
new vm.Script(fs.readFileSync(path.join(root, "dist/data/methodology-data.js"), "utf8"), {
  filename: "methodology-data.js",
});

console.log("Methodology verification passed: 318 source tasks, 110 terms; senior age extension is migration-managed.");
