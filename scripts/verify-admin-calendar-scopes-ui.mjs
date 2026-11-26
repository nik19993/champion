// Usage: node scripts/verify-admin-calendar-scopes-ui.mjs ESBUILD_MODULE PLAYWRIGHT_MODULE CHROMIUM_PATH
// Every record and request is synthetic. This script never contacts Supabase.
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

if (process.argv.length < 5) throw Error("Pass esbuild, Playwright and Chromium paths.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { build } = await import(pathToFileURL(resolve(process.argv[2])).href);
const { chromium } = await import(pathToFileURL(resolve(process.argv[3])).href);
const directory = await mkdtemp(join(tmpdir(), "champion-calendar-scopes-"));
let browser, checks = 0;
const check = (ok, message) => { assert.ok(ok, message); checks++; };
try {
  const bundle = join(directory, "fixture.js");
  await build({ entryPoints: [join(root, "tests/ui/admin-calendar-scopes-fixture.jsx")], outfile: bundle, bundle: true, platform: "browser", format: "iife", jsx: "automatic", tsconfig: join(root, "tsconfig.json"), define: { "process.env.NODE_ENV": '"test"' }, alias: { "next/image": join(root, "tests/ui/image-stub.jsx") } });
  const js = await readFile(bundle), css = await readFile(join(root, "app/globals.css"));
  browser = await chromium.launch({ executablePath: resolve(process.argv[4]), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://calendar-scopes.test") throw Error(`Unexpected external request: ${url.origin}`);
    if (url.pathname === "/fixture.js") return route.fulfill({ body: js, contentType: "application/javascript" });
    if (url.pathname === "/style.css") return route.fulfill({ body: css, contentType: "text/css" });
    return route.fulfill({ body: '<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/fixture.js"></script></html>', contentType: "text/html" });
  });
  await page.goto("https://calendar-scopes.test");
  const main = page.getByRole("tab", { name: "Календар основних груп", exact: true });
  const locations = page.getByRole("tab", { name: "Календар локацій", exact: true });
  const rows = page.locator(".admin-calendar-event");
  const options = label => page.getByLabel(label, { exact: true }).locator("option").evaluateAll(items => items.map(item => item.value));
  await rows.filter({ hasText: "U12A" }).waitFor();
  check(await main.getAttribute("aria-selected") === "true", "main groups open by default");
  check(await rows.count() === 2, "main calendar includes age and goalkeeper events only");
  check(!(await options("Група")).includes("location2"), "main group filter excludes location teams");
  await page.getByLabel("Група", { exact: true }).selectOption("main");
  check(await rows.count() === 1, "main group filtering still works");
  await locations.click();
  await page.getByText("Локація № 2 A", { exact: true }).last().waitFor();
  check(await rows.count() === 2, "location calendar displays both normal and Junior location groups");
  check(await page.getByLabel("Група", { exact: true }).inputValue() === "", "main filters do not hide location records");
  check(!(await options("Група")).includes("main") && !(await options("Група")).includes("keeper"), "location group choices are separate");
  check(!(await options("Тренер")).includes("keeper-coach"), "location coach filter excludes main-only staff");
  check(!(await options("Майданчик")).includes("field1"), "location venue filter contains relevant schools");
  await rows.filter({ hasText: "Локація № 2 A" }).click();
  check(await page.evaluate(() => adminCalendarQa.opened) === "location-event", "opening a location event preserves its original ID");
  await page.getByLabel("Тренер", { exact: true }).selectOption("shared-coach");
  check(await rows.count() === 1 && (await rows.textContent()).includes("Локація № 2 A"), "a coach of both kinds has only location events here");
  await main.click();
  check(await page.getByLabel("Група", { exact: true }).inputValue() === "main", "main filters are remembered separately");
  check(await rows.count() === 1 && (await rows.textContent()).includes("U12A"), "returning to main never mixes location data");
  await page.getByRole("button", { name: "Місяць", exact: true }).click();
  await locations.click();
  check(await page.locator(".admin-calendar-month").count() === 1, "the chosen period is shared when switching calendars");
  await page.evaluate(() => adminCalendarQa.addLocationEvent());
  await page.waitForFunction(() => document.querySelectorAll(".admin-calendar-event").length === 2);
  check(await rows.count() === 2, "new trainer data appears after the normal revision refresh");
  await page.getByLabel("Тренер", { exact: true }).selectOption("");
  await page.getByLabel("Показати скасовані").check();
  check(await rows.count() === 3, "cancelled events without comments remain hidden");
  await page.evaluate(() => { adminCalendarQa.fail = true; adminCalendarQa.refresh(); });
  await page.getByText("Не вдалося оновити календар. Показано попередні дані.", { exact: true }).waitFor();
  check(await rows.count() === 3 && !(await rows.allTextContents()).join(" ").includes("U12A"), "failed refresh retains only the selected scope in cached data");
  await page.evaluate(() => { adminCalendarQa.fail = false; adminCalendarQa.refresh(); });
  await page.getByText("Не вдалося оновити календар. Показано попередні дані.", { exact: true }).waitFor({ state: "detached" });
  for (const width of [320, 360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    const layout = await page.locator(".admin-calendar").evaluate(panel => {
      const tabs = [...panel.querySelectorAll('[role="tab"]')].map(tab => { const rect = tab.getBoundingClientRect(); return { left: rect.left, right: rect.right }; });
      return { tabs, viewport: innerWidth, client: panel.clientWidth, scroll: panel.scrollWidth };
    });
    check(layout.tabs.every(tab => tab.left >= 0 && tab.right <= layout.viewport) && layout.scroll <= layout.client + 1, `both tabs and calendar fit at ${width}px`);
  }
  await page.evaluate(() => { adminCalendarQa.events = adminCalendarQa.events.filter(event => event.groups.group_kind !== "location"); adminCalendarQa.refresh(); });
  await page.waitForFunction(() => document.querySelectorAll(".admin-calendar-event").length === 0);
  check(await rows.count() === 0, "an empty location calendar never falls back to main events");
  await main.click();
  check(await rows.count() === 1, "main events remain available when the location calendar is empty");
  check(await page.evaluate(() => adminCalendarQa.calls.every(call => call.operation === "read")), "view switching never mutates a booking");
  check(errors.length === 0, `no runtime errors: ${errors.join("; ")}`);
  console.log(`PASS: ${checks} isolated administrator-calendar checks; no real accounts or external requests.`);
} finally { await browser?.close(); await rm(directory, { recursive: true, force: true }); }
