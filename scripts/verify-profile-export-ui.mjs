// Usage: node scripts/verify-profile-export-ui.mjs ESBUILD_MODULE PLAYWRIGHT_MODULE CHROMIUM_PATH [QA_PORTRAIT] [OUTPUT_DIR]
// All API responses and identities are synthetic; never connects to Supabase.
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
if (process.argv.length < 5) throw new Error("Pass esbuild, Playwright and Chromium executable paths.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { build } = await import(pathToFileURL(resolve(process.argv[2])).href);
const { chromium } = await import(pathToFileURL(resolve(process.argv[3])).href);
const directory = await mkdtemp(join(tmpdir(), "champion-profile-ui-"));
const output = process.argv[6] ? resolve(process.argv[6]) : null;
const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4f4vhPwAHjgLZy42ZSAAAAABJRU5ErkJggg==", "base64");
let browser;
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
try {
  const bundle = join(directory, "fixture.js");
  await build({ entryPoints: [join(root, "tests/ui/profile-export-fixture.jsx")], outfile: bundle, bundle: true, platform: "browser", format: "iife", jsx: "automatic", tsconfig: join(root, "tsconfig.json"), define: { "process.env.NODE_ENV": '"test"' } });
  const [source, styles, emblem, portrait] = await Promise.all([readFile(bundle), readFile(join(root, "app/globals.css")), readFile(join(root, "public/champion-club-emblem.jpg")), process.argv[5] ? readFile(resolve(process.argv[5])) : Promise.resolve(tinyPng)]);
  browser = await chromium.launch({ executablePath: resolve(process.argv[4]), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  page.on("pageerror", (error) => errors.push(error.message));
  let denyEmblem = false;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://profile-check.test") throw new Error(`Unexpected network request: ${url.origin}`);
    if (url.pathname === "/fixture.js") return route.fulfill({ body: source, contentType: "application/javascript" });
    if (url.pathname === "/style.css") return route.fulfill({ body: styles, contentType: "text/css" });
    if (url.pathname === "/champion-club-emblem.jpg") return route.fulfill({ body: denyEmblem ? "Unavailable" : emblem, contentType: denyEmblem ? "text/plain" : "image/jpeg" });
    if (url.pathname === "/qa-portrait.png") return route.fulfill({ body: portrait, contentType: "image/png" });
    return route.fulfill({ body: '<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/fixture.js"></script></html>', contentType: "text/html" });
  });
  await page.goto("https://profile-check.test/");
  const card = page.locator(".export-grid article").filter({ has: page.getByRole("heading", { name: "Профіль гравця", exact: true }) });
  await card.waitFor();
  await page.waitForFunction(() => document.querySelector(".export-player-select select")?.value === "player-demo");
  const button = card.getByRole("button", { name: "Завантажити PDF", exact: true });
  const mode = page.getByLabel("Період профілю", { exact: true });
  const imported = await page.evaluate(() => window.profileQa.parseActivity("Група;Гравець;Дата оцінювання;Показник;Значення\nU11A;Коваль Марко Андрійович;20.09.2026;Лідерські якості;4"));
  check(imported[0].errors.length === 0 && imported[0].values.period === "20.09.2026", "actual CSV parser accepts an assessment date without rewriting its key");
  const oldImport = await page.evaluate(() => window.profileQa.parseActivity("Група;Гравець;Період;Показник;Значення\nU11A;Коваль Марко Андрійович;І півріччя 2026;Лідерські якості;4"));
  check(oldImport[0].errors.length === 0 && oldImport[0].values.period === "І півріччя 2026", "existing period imports remain valid");
  const reset = async () => page.evaluate(() => { window.profileQa.text = []; window.profileQa.canvases = []; window.profileQa.images = []; window.profileQa.calls = []; });
  const render = async () => {
    await reset();
    const waiting = page.waitForEvent("download");
    await button.click();
    const download = await waiting;
    await page.waitForFunction(() => [...document.querySelectorAll(".export-grid article")].find((a) => a.querySelector("h2")?.textContent === "Профіль гравця")?.querySelector("button")?.disabled === false);
    const bytes = await readFile(await download.path());
    check(bytes.subarray(0, 5).toString() === "%PDF-" && bytes.subarray(-24).toString().includes("%%EOF"), "download is a complete PDF");
    return { bytes, text: await page.evaluate(() => window.profileQa.text), images: await page.evaluate(() => window.profileQa.images), calls: await page.evaluate(() => window.profileQa.calls) };
  };
  const has = (result, value) => result.text.some((entry) => entry.value.includes(value));
  const dates = (result, value) => result.text.filter((entry) => entry.value === value).length;
  const first = await render();
  check(["15.09.2025", "15.03.2026", "20.09.2026"].every((date) => dates(first, date) === 2), "three precise chronological dates appear in both matrices");
  const note = first.text.findIndex((entry) => entry.value === "Коротка характеристика тренера");
  const physical = first.text.findIndex((entry) => entry.value === "Фізична підготовленість");
  check(note >= 0 && note < physical, "coach note precedes physical testing");
  check(has(first, "18.02.2016") && has(first, "2016 р.н.") && has(first, "2026/2027"), "full DOB, birth cohort and season preserved");
  check(first.images.some((entry) => entry.src.startsWith("blob:") && entry.coordinates[0] > 900 && entry.coordinates[1] < 500), "player photo is to the right of name/DOB");
  check(has(first, "—") && has(first, "Контакти батьків") && has(first, "Демонстраційний контакт"), "missing result and guardian contact retained");
  check(first.calls.some((entry) => entry.bucket === "player-photos" && entry.path === "synthetic-photo.png"), "photo downloaded through authenticated private Storage API");
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(join(output, "actual-player-profile.pdf"), first.bytes);
    const pages = await page.evaluate(() => window.profileQa.canvases.map((canvas) => canvas.toDataURL("image/png").split(",")[1]));
    for (let i = 0; i < pages.length; i++) await writeFile(join(output, `actual-player-profile-${i + 1}.png`), Buffer.from(pages[i], "base64"));
  }
  await mode.selectOption("year");
  await page.getByLabel("Рік результатів").fill("2026");
  const year = await render();
  check(dates(year, "15.09.2025") === 0 && dates(year, "15.03.2026") === 2 && dates(year, "20.09.2026") === 2, "year filter includes exactly selected year");
  await mode.selectOption("range");
  await page.getByLabel("Від дати").fill("2026-03-15");
  await page.getByLabel("До дати").fill("2026-03-15");
  const range = await render();
  check(dates(range, "15.03.2026") === 2 && dates(range, "20.09.2026") === 0, "inclusive one-day range applies to both matrices");
  await page.getByLabel("Від дати").fill("2026-09-21");
  await reset();
  await button.click();
  await page.getByText(/Вкажіть початок і кінець періоду/).waitFor();
  check(await page.evaluate(() => window.profileQa.calls.length === 0 && window.profileQa.canvases.length === 0), "invalid date range is rejected before queries or download");
  for (const width of [320, 360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const fits = await card.locator(".profile-export-period").evaluate((element) => element.scrollWidth <= element.clientWidth + 1 && element.getBoundingClientRect().right <= innerWidth);
    check(fits, `period controls fit at ${width}px`);
  }
  await mode.selectOption("all");
  for (const failure of ["photo-query-error", "photo-error", "bad-photo"]) {
    await page.evaluate((mode) => { window.profileQa.mode = mode; }, failure);
    const result = await render();
    check(has(result, "Фото не") && await page.getByText(/Фото тимчасово недоступне/).count() === 1, `${failure} keeps PDF usable with a clear warning`);
  }
  await page.evaluate(() => { window.profileQa.mode = "normal"; window.profileQa.db.player_photos[0].file_assets = [window.profileQa.db.player_photos[0].file_assets]; });
  check((await render()).images.some((entry) => entry.src.startsWith("blob:")), "array photo relation supported");
  await page.evaluate(() => { window.profileQa.db.player_photos[0].file_assets = null; });
  check(has(await render(), "Фото не"), "null photo relation supported");
  denyEmblem = true;
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".export-player-select select")?.value === "player-demo");
  const noEmblem = await render();
  check(has(noEmblem, "КЛУБ ЧЕМПІОН") && await page.getByText(/Емблема тимчасово недоступна/).count() === 1, "emblem failure uses text header and warning");
  denyEmblem = false;
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".export-player-select select")?.value === "player-demo");
  await page.evaluate(() => { window.profileQa.db.game_activity_results.push({ id: "legacy", player_id: "player-demo", period: "І півріччя 2026", metric_name: "Історична оцінка", value: "0" }); });
  const legacy = await render();
  check(has(legacy, "Історичні ігрові оцінки") && has(legacy, "І півріччя 2026") && has(legacy, "0"), "undated legacy period and numeric zero retained");
  await mode.selectOption("year");
  const legacyYear = await render();
  check(has(legacyYear, "Записи без точної дати") && !has(legacyYear, "І півріччя 2026"), "undated periods are disclosed rather than falsely assigned a date");
  await mode.selectOption("all");
  await page.evaluate(() => {
    const qa = window.profileQa;
    qa.db.physical_test_results = Array.from({ length: 1000 }, (_, i) => ({ id: `history-${i}`, player_id: "player-demo", measured_on: "2025-09-15", metric_name: "Довга історія", value: "1" }));
    for (const date of ["2026-01-15", "2026-03-15", "2026-06-15", "2026-09-20"]) qa.db.physical_test_results.push({ id: date, player_id: "player-demo", measured_on: date, metric_name: "Результат після 1000", value: "7" });
  });
  const paginated = await render();
  check(paginated.calls.some((entry) => entry.table === "physical_test_results" && entry.bounds?.[0] === 1000), "complete history fetches beyond API's first 1000 rows");
  check(["15.01.2026", "15.06.2026", "20.09.2026"].every((date) => dates(paginated, date) >= 1), "more than three dates retained across table blocks and pages");
  await page.evaluate(() => {
    const qa = window.profileQa;
    qa.db.physical_test_results = [{ id: "long", player_id: "player-demo", measured_on: "2026-09-20", metric_name: "Дуже довга назва показника ".repeat(90), value: "5" }];
    qa.db.game_activity_results = [];
    qa.db.guardians = [{ player_id: "player-demo", full_name: "Довгий контакт ".repeat(80), relation: "Мати" }];
  });
  const long = await render();
  check(long.text.filter((entry) => entry.value.includes("Дуже довга")).length > 20 && new Set(long.text.map((entry) => entry.page)).size > 1, "long labels are wrapped and paginated instead of truncated");
  const overflow = long.text.filter((entry) => entry.x < 0 || entry.x + entry.width > 1167 || (entry.y < 1649 && entry.y + 29 > 1640));
  check(overflow.length === 0, `long report has no body/footer or horizontal text collisions: ${JSON.stringify(overflow.slice(0, 3))}`);
  await page.evaluate(() => {
    const player = window.profileQa.db.players[0];
    player.full_name = "Демонстраційний гравець із довгим прізвищем ".repeat(4);
    player.coach_note = "Довга характеристика тренера: точні коментарі про роботу гравця. ".repeat(130);
    player.coach_note_author_name = "Демонстраційне довге ім’я тренера ".repeat(7);
  });
  await page.locator(".workspace-actions select").selectOption("group-demo");
  await page.waitForFunction(() => document.querySelector(".export-player-select select")?.selectedOptions[0]?.textContent.includes("довгим"));
  const longNote = await render();
  check(longNote.text.filter((entry) => entry.value.includes("Довга характеристика")).length > 30 && longNote.text.some((entry) => entry.value.includes("Коротка характеристика тренера · продовження")), "long coach note and attribution continue across pages");
  check(longNote.text.every((entry) => entry.x >= 0 && entry.x + entry.width <= 1167 && (entry.y >= 1649 || entry.y + 29 <= 1640)), "long name, note and author stay inside PDF margins");
  await page.evaluate(() => { window.profileQa.db.physical_test_results = []; window.profileQa.db.guardians = []; });
  const empty = await render();
  check(empty.text.filter((entry) => entry.value === "Дані за вибраний період не внесено.").length === 2, "empty assessments show clear placeholders in both sections");
  await page.evaluate(() => { window.profileQa.mode = "history-error"; });
  await reset();
  await button.click();
  await page.getByText("Не вдалося завантажити історію результатів для PDF.", { exact: true }).waitFor();
  check(await button.isEnabled() && await page.evaluate(() => window.profileQa.canvases.length === 0), "history error leaves export retryable without falsely complete PDF");
  check(errors.length === 0, `no uncaught browser errors: ${errors.join("; ")}`);
  console.log(`PASS: ${checks} profile export browser checks on synthetic data; no staging or production requests.`);
} finally { await browser?.close(); await rm(directory, { recursive: true, force: true }); }
