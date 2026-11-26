// Usage: node scripts/verify-event-materials-ui.mjs ESBUILD_MODULE PLAYWRIGHT_MODULE CHROMIUM_PATH
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { pathToFileURL, fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";

if (process.argv.length < 5) throw Error("Pass esbuild, playwright and Chromium paths.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { build } = await import(pathToFileURL(resolve(process.argv[2])).href);
const { chromium } = await import(pathToFileURL(resolve(process.argv[3])).href);
const directory = await mkdtemp(join(tmpdir(), "champion-documents-"));
let browser;
let checks = 0;
const check = (ok, message) => { assert.ok(ok, message); checks++; };
try {
  const bundle = join(directory, "fixture.js");
  await build({ entryPoints: [join(root, "tests/ui/event-materials-fixture.jsx")], outfile: bundle, bundle: true, platform: "browser", format: "esm", jsx: "automatic", tsconfig: join(root, "tsconfig.json"), define: { "process.env.NODE_ENV": '"test"' }, alias: { "next/image": join(root, "tests/ui/image-stub.jsx") } });
  const workerBundle = join(directory, "worker.js");
  await build({ entryPoints: [join(root, "lib/browser/training-document-worker.ts")], outfile: workerBundle, bundle: true, platform: "browser", format: "esm" });
  const workerSource = await readFile(workerBundle);
  const source = await readFile(bundle);
  const css = await readFile(join(root, "app/globals.css"));
  browser = await chromium.launch({ executablePath: resolve(process.argv[4]), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.context().route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://documents-check.test") throw Error(`Unexpected external request: ${url.origin}`);
    if (url.pathname === "/fixture.js") return route.fulfill({ body: source, contentType: "application/javascript" });
    if (url.pathname === "/training-document-worker.ts") return route.fulfill({ body: workerSource, contentType: "application/javascript" });
    if (url.pathname === "/style.css") return route.fulfill({ body: css, contentType: "text/css" });
    return route.fulfill({ body: '<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>', contentType: "text/html" });
  });
  const open = async () => { await page.locator(".calendar-event").first().click(); await page.getByRole("heading", { name: "Прикріплені документи", exact: true }).waitFor(); };
  const word = Buffer.from(zipSync({ "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'), "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>План заняття</w:t></w:r></w:p></w:body></w:document>') }));
  const choose = async name => {
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "", buffer: name.endsWith(".docx") ? word : Buffer.from("%PDF-1.4 synthetic document") });
    await page.getByText(/Стискання перевірено:|Стиснуто:/).waitFor();
  };
  await page.goto("https://documents-check.test");
  await open();
  await page.getByText("Прикріплених документів немає.", { exact: true }).waitFor();
  const oversized = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "word/document.xml": strToU8("<document/>"), "word/media/data.bin": randomBytes(1_100_000) }, { level: 0 });
  await page.locator('input[type="file"]').setInputFiles({ name: "too-large.docx", buffer: Buffer.from(oversized), mimeType: "" });
  await page.getByText(/Після спроби стискання документ перевищує 1 МБ/).waitFor();
  check(await page.getByRole("button", { name: "Зберегти зміни", exact: true }).isEnabled(), "rejected compression does not block saving the training without a document");
  check(await page.evaluate(() => documentQa.calls.some(call => call.storage === "upload")) === false, "the original oversized file never reaches Storage");
  await choose("План.pdf");
  check(await page.getByText(/Документ ще не прикріплено/).count() === 1, "choosing a file is explicitly pending");
  await page.getByRole("button", { name: "Прикріпити документ", exact: true }).click();
  await page.getByText(/Документ прикріплено\. Він доступний/).waitFor();
  check(await page.getByRole("button", { name: "План.pdf", exact: true }).count() === 1, "confirmed saved file appears in own event editor");
  check(await page.evaluate(() => documentQa.calls.filter(call => call.table === "events" && call.op !== "read").length) === 0, "attaching to an existing event never changes its booking");
  await page.reload(); await open();
  await page.getByRole("button", { name: "План.pdf", exact: true }).waitFor();
  check(await page.locator('input[type="file"]').inputValue() === "", "empty browser file input is separate from persisted documents");
  await page.evaluate(() => { documentQa.mode = "read-error"; });
  await page.getByRole("button", { name: "Закрити вікно", exact: true }).click(); await open();
  await page.getByText(/Не вдалося завантажити перелік документів/).waitFor();
  check(await page.getByText("Прикріплених документів немає.", { exact: true }).count() === 0, "read failure does not misreport missing documents");
  await page.evaluate(() => { documentQa.mode = "normal"; });
  await page.getByRole("button", { name: "Повторити завантаження документів" }).click();
  await page.getByRole("button", { name: "План.pdf", exact: true }).waitFor();
  await page.getByRole("button", { name: "Закрити вікно", exact: true }).click();

  await page.locator(".calendar-day.today .calendar-plus").click();
  await page.getByLabel("Навчальне завдання", { exact: true }).selectOption("task-test");
  await choose("Новий план.docx");
  await page.evaluate(() => { documentQa.mode = "attach-error"; });
  await page.getByRole("button", { name: "Створити подію", exact: true }).click();
  await page.getByText(/Подію збережено, але документ не прикріплено/).waitFor();
  check(await page.getByRole("button", { name: "Створити подію", exact: true }).count() === 0, "partial save becomes editing the already confirmed event");
  check(await page.evaluate(() => documentQa.db.events.length) === 2, "failed attachment creates exactly one event");
  await page.evaluate(() => { documentQa.mode = "normal"; });
  await page.getByRole("button", { name: "Прикріпити документ", exact: true }).click();
  await page.getByRole("button", { name: "Новий план.docx", exact: true }).waitFor();
  check(await page.evaluate(() => documentQa.calls.filter(call => call.storage === "upload").length) === 1, "retry reuses the validated file instead of uploading again");
  check(await page.evaluate(() => documentQa.db.events.length) === 2, "retry never creates a duplicate event or self-conflict");
  check(await page.evaluate(() => documentQa.calls.find(call => call.storage === "upload").mime) === "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Word upload supplies MIME even when the browser leaves it empty");
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    const size = await page.locator(".modal-body").evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth }));
    check(size.scroll <= size.client + 1, `documents do not overflow the modal at ${width}px`);
  }
  await page.reload();
  await page.locator(".calendar-event").nth(1).click();
  await page.getByRole("button", { name: "Новий план.docx", exact: true }).waitFor();
  check(await page.evaluate(() => documentQa.db.events.length) === 2, "new event and document remain linked after a fresh page load");
  check(errors.length === 0, `no uncaught browser errors: ${errors.join("; ")}`);
  console.log(`PASS: ${checks} isolated document browser checks; no real accounts or external requests.`);
} finally { await browser?.close(); await rm(directory, { recursive: true, force: true }); }
