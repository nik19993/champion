// Usage: node scripts/verify-calendar-ui.mjs ESBUILD_MODULE PLAYWRIGHT_MODULE CHROMIUM_PATH
// Modules may be installed in a separate test folder; production dependencies are unchanged.
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";

if (process.argv.length < 5) throw new Error("Pass esbuild module, playwright module, and Chromium executable paths.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { build } = await import(pathToFileURL(resolve(process.argv[2])).href);
const { chromium } = await import(pathToFileURL(resolve(process.argv[3])).href);
const directory = await mkdtemp(join(tmpdir(), "champion-calendar-ui-"));
let browser;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
try {
  const bundle = join(directory, "fixture.js");
  await build({ entryPoints: [join(root, "tests/ui/calendar-fixture.jsx")], outfile: bundle, bundle: true, platform: "browser", format: "iife", jsx: "automatic", tsconfig: join(root, "tsconfig.json"), define: { "process.env.NODE_ENV": '"test"' }, alias: { "next/image": join(root, "tests/ui/image-stub.jsx") } });
  const source = await readFile(bundle);
  const styles = await readFile(join(root, "app/globals.css"));
  browser = await chromium.launch({ executablePath: resolve(process.argv[4]), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://calendar-check.test") throw new Error(`Unexpected network request: ${url.origin}`);
    if (url.pathname === "/fixture.js") return route.fulfill({ body: source, contentType: "application/javascript" });
    if (url.pathname === "/style.css") return route.fulfill({ body: styles, contentType: "text/css" });
    return route.fulfill({ body: '<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/fixture.js"></script></html>', contentType: "text/html" });
  });
  await page.goto("https://calendar-check.test/");
  await page.locator(".calendar-panel").waitFor();
  check(await page.locator(".calendar-event").count() === 2, "one assigned group shown initially");
  await page.locator(".calendar-tools select").selectOption("__all_coach_groups__");
  check(await page.locator(".calendar-event").count() === 4, "all and only assigned groups shown");
  await page.getByRole("button", { name: "Запланувати", exact: true }).click();
  check(await page.getByLabel("Група події").inputValue() === "", "creation from all groups requires an explicit group");
  check(await page.getByRole("button", { name: "Створити подію", exact: true }).isDisabled(), "creation cannot default to an arbitrary first group");
  await page.getByLabel("Група події").selectOption("group-b");
  check(await page.getByLabel("Навчальне завдання", { exact: true }).locator('option[value="current-task"]').count() === 1, "new season curriculum is selectable");
  check(await page.getByLabel("Навчальне завдання", { exact: true }).locator('option[value="old-task"]').count() === 0, "baseline age does not control current season tasks");
  const duration = page.getByLabel("Тривалість у хвилинах");
  await duration.fill("");
  check(await duration.inputValue() === "", "clearing duration leaves blank");
  await duration.pressSequentially("060");
  check(await duration.inputValue() === "60", "typing normalizes the leading zero immediately");
  await page.getByLabel("Навчальне завдання", { exact: true }).selectOption("task-a");
  for (const width of [320, 360, 390, 600, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator(".modal-card").evaluate((modal) => {
      const body = modal.querySelector(".modal-body");
      const task = [...modal.querySelectorAll("label")].find((label) => label.textContent.startsWith("Навчальне завдання"))?.querySelector("select");
      const rect = task.getBoundingClientRect();
      return { bodyWidth: body.clientWidth, scrollWidth: body.scrollWidth, left: rect.left, right: rect.right, viewport: innerWidth };
    });
    check(layout.scrollWidth <= layout.bodyWidth + 1 && layout.left >= 0 && layout.right <= layout.viewport, `no horizontal form overflow at ${width}px with a very long task title`);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  if (process.env.CHAMPION_UI_SCREENSHOT_DIR) await page.screenshot({ path: join(resolve(process.env.CHAMPION_UI_SCREENSHOT_DIR), "calendar-editor-mobile.png") });
  await page.getByRole("button", { name: "Створити подію", exact: true }).click();
  await page.locator(".modal-card").waitFor({ state: "detached" });
  const created = await page.evaluate(() => window.calendarQa.calls.findLast((call) => call.table === "events" && call.operation === "insert"));
  check(created.payload.group_id === "group-b" && created.payload.duration_minutes === 60, "create sends selected group and numeric minutes");

  // Editing an event in all-groups view must never move it to the first group.
  await page.locator(".calendar-event").filter({ hasText: "U12B" }).first().click();
  check((await page.getByRole("dialog").getAttribute("aria-labelledby")) != null && (await page.locator(".modal-card > header").textContent()).includes("U12B"), "editor uses the event's group");
  await page.getByLabel("Тривалість у хвилинах").fill("90");
  await page.getByRole("button", { name: "Зберегти зміни", exact: true }).click();
  await page.locator(".modal-card").waitFor({ state: "detached" });
  check(await page.evaluate(() => window.calendarQa.db.events.find((event) => event.id === "event-b").group_id === "group-b"), "edit retains original group");

  await page.locator(".calendar-event").filter({ hasText: "U12A" }).first().click();
  await page.getByRole("button", { name: "Прибрати з календаря", exact: true }).click();
  await page.getByRole("button", { name: "Залишити подію", exact: true }).click();
  check(await page.evaluate(() => window.calendarQa.db.events.some((event) => event.id === "event-a")), "canceling confirmation does not delete");
  await page.getByRole("button", { name: "Прибрати з календаря", exact: true }).click();
  await page.getByRole("button", { name: "Підтвердити видалення", exact: true }).click();
  await page.locator(".modal-card").waitFor({ state: "detached" });
  check(await page.evaluate(() => !window.calendarQa.db.events.some((event) => event.id === "event-a")), "actual deletion is confirmed");

  await page.locator(".calendar-event").filter({ hasText: "U12B" }).nth(1).click();
  await page.getByRole("button", { name: "Прибрати з календаря", exact: true }).click();
  await page.getByRole("button", { name: "Підтвердити скасування", exact: true }).click();
  await page.locator(".modal-card").waitFor({ state: "detached" });
  check(await page.evaluate(() => window.calendarQa.db.events.find((event) => event.id === "event-history").status === "cancelled" && window.calendarQa.db.attendance_records.length === 1 && window.calendarQa.db.attendance_sessions.length === 1), "cancel preserves attendance records and event identity");

  await page.locator(".calendar-event").filter({ hasText: "U12B" }).first().click();
  await page.getByRole("button", { name: "Прибрати з календаря", exact: true }).click();
  await page.evaluate(() => { window.calendarQa.mode = "zero-delete"; });
  await page.getByRole("button", { name: "Підтвердити видалення", exact: true }).click();
  await page.getByText(/Подію не прибрано/).waitFor();
  check(await page.evaluate(() => window.calendarQa.db.events.some((event) => event.id === "event-b")), "RLS-like zero rows never claim successful deletion");
  await page.evaluate(() => { window.calendarQa.mode = "reject-delete"; });
  await page.getByRole("button", { name: "Прибрати з календаря", exact: true }).click();
  await page.getByRole("button", { name: "Підтвердити видалення", exact: true }).click();
  await page.getByRole("alert").waitFor();
  check(await page.getByRole("button", { name: "Підтвердити видалення", exact: true }).isEnabled(), "network failure leaves a retryable confirmation");
  await page.getByRole("button", { name: "Залишити подію", exact: true }).click();
  await page.getByRole("button", { name: "Закрити", exact: true }).click();
  await page.locator(".calendar-event").filter({ hasText: "U12A" }).first().click();
  check(await page.getByRole("button", { name: "Прибрати з календаря", exact: true }).isDisabled(), "another coach's event cannot be removed");
  await page.getByRole("button", { name: "Закрити", exact: true }).click();

  await page.evaluate(() => window.calendarQa.report());
  await page.locator(".operational-report-table").waitFor();
  const headers = await page.locator(".operational-report-table th").allTextContents();
  check(JSON.stringify(headers) === JSON.stringify(["Дата", "Вікова група", "Тренер", "Що потрібно зробити / коментар", "Подія / ситуація", "Стан"]), "report columns follow the requested order");
  const report = await page.locator(".operational-report-table").textContent();
  check(report.includes("Автобус; Лікар; Інше: питна вода") && report.includes("Телефонувати відповідальному за поле.") && report.includes("Тестовий тренер") && report.includes("Турнір групи"), "report renders complete actionable details and context");
  await page.evaluate(() => window.calendarQa.export());
  const exportCard = page.locator(".export-grid article").filter({ has: page.getByRole("heading", { name: "План і загальний звіт", exact: true }) });
  await exportCard.waitFor();
  const downloaded = page.waitForEvent("download");
  await exportCard.getByRole("button", { name: "CSV", exact: true }).click();
  const download = await downloaded;
  const csv = await readFile(await download.path(), "utf8");
  check(csv.includes("Що потрібно зробити / коментар") && csv.includes("Телефонувати відповідальному за поле.") && csv.includes("Автобус; Лікар; Інше: питна вода") && csv.includes("Турнір групи"), "actual CSV download retains report details");
  check(errors.length === 0, `no uncaught browser errors: ${errors.join("; ")}`);
  await writeFile(join(directory, "result.json"), JSON.stringify({ checks, pageErrors: errors }));
  console.log(`PASS: ${checks} browser checks on synthetic data; no staging or production requests.`);
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
