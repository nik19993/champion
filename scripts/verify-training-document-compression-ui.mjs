// Tests the actual Next production worker, with synthetic files and no accounts.
// Usage: node scripts/verify-training-document-compression-ui.mjs PLAYWRIGHT_MODULE CHROMIUM_PATH
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { PDFDocument, PDFRawStream, StandardFonts } from "pdf-lib";

if (process.argv.length < 4) throw Error("Pass Playwright module and Chromium paths.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const route = join(root, "app/compression-check");
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
let browser, routeCreated = false, checks = 0;
const check = (ok, message) => { assert.ok(ok, message); checks++; };
try {
  await mkdir(route); routeCreated = true;
  await writeFile(join(route, "page.tsx"), await readFile(join(root, "tests/ui/training-document-compression-page.tsx")));
  await new Promise((ok, fail) => {
    const process = spawn("npm", ["run", "build"], { cwd: root, env: { ...globalThis.process.env, NEXT_TELEMETRY_DISABLED: "1" } });
    let output = "";
    process.stdout.on("data", data => { output += data; }); process.stderr.on("data", data => { output += data; });
    process.on("error", fail); process.on("close", code => code === 0 ? ok() : fail(Error(output)));
  });
  browser = await chromium.launch({ executablePath: resolve(process.argv[3]), headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const errors = [];
  await context.route("**/*", async intercepted => {
    const url = new URL(intercepted.request().url());
    if (url.origin !== "https://compression-next.test") throw Error(`Unexpected external request: ${url.origin}`);
    let name = decodeURIComponent(url.pathname);
    if (name === "/compression-check/" || name === "/compression-check") name = "/compression-check/index.html";
    const path = resolve(root, "out", "." + name);
    if (!path.startsWith(join(root, "out") + "/")) throw Error("Invalid fixture path");
    try {
      const body = await readFile(path);
      const type = ({ ".js": "application/javascript", ".html": "text/html", ".css": "text/css" })[extname(path)] ?? "application/octet-stream";
      return intercepted.fulfill({ body, contentType: type });
    } catch { return intercepted.fulfill({ status: 404, body: "Not found" }); }
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("https://compression-next.test/compression-check/");
  await page.getByLabel("Synthetic file").waitFor();
  const processFile = async (name, buffer) => {
    await page.getByLabel("Synthetic file").setInputFiles({ name, buffer: Buffer.from(buffer), mimeType: "" });
    await page.waitForFunction(() => document.querySelector("output").textContent.startsWith("{"), null, { timeout: 35_000 });
    return JSON.parse(await page.locator("output").textContent());
  };
  const processedBytes = async () => Buffer.from(await page.evaluate(async () => {
    const file = globalThis.preparedFile;
    return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(",")[1]); reader.readAsDataURL(file); });
  }), "base64");
  const types = strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  const xml = strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>План тренування: текст залишається текстом.</w:t></w:r></w:p></w:body></w:document>');
  const word = extra => zipSync({ "[Content_Types].xml": types, "word/document.xml": xml, ...extra }, { level: 0 });
  const smallWord = word({ "word/styles.xml": strToU8("<styles>" + "style ".repeat(30000) + "</styles>") });
  const small = await processFile("small.docx", smallWord);
  check(small.attempted && small.after < small.before && !small.note, "the actual Next worker compresses a file already below 1 MB");
  check(small.before < 1_000_000, "small-file scenario is below the limit before processing");
  check(Buffer.from(unzipSync(await processedBytes())["word/document.xml"]).equals(Buffer.from(xml)), "Word text survives byte for byte");

  const largeWord = word({ "word/styles.xml": strToU8("<styles>" + "style ".repeat(200000) + "</styles>") });
  const large = await processFile("large.docx", largeWord);
  check(large.before > 1_000_000 && large.after <= 1_000_000 && !large.note, "a large Word file can be reduced below 1 MB");
  const bad = await processFile("large-incompressible.docx", word({ "word/media/data.bin": randomBytes(1_150_000) }));
  check(bad.error?.includes("1 МБ"), "an incompressible file is rejected after processing");

  const jpeg = Buffer.from(await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(1200, 900), ctx = canvas.getContext("2d");
    const image = ctx.createImageData(1200, 900); let seed = 823;
    for (let i = 0; i < image.data.length; i += 4) { for (let j = 0; j < 3; j++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; image.data[i + j] = seed >>> 24; } image.data[i + 3] = 255; }
    ctx.putImageData(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 1 });
    return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(",")[1]); reader.readAsDataURL(blob); });
  }), "base64");
  const photo = await processFile("scheme.jpg", jpeg);
  check(photo.before > 1_000_000 && photo.after <= 1_000_000 && !photo.note, "a real raster image is compressed below 1 MB");
  const wordImage = await processFile("with-image.docx", word({ "word/media/image1.jpeg": jpeg }));
  check(wordImage.before > 1_000_000 && wordImage.after <= 1_000_000 && !wordImage.note, "embedded Word images are compressed");
  check(Buffer.from(unzipSync(await processedBytes())["word/document.xml"]).equals(Buffer.from(xml)), "embedded-image optimisation leaves Word XML unchanged");

  const pdf = await PDFDocument.create();
  const pdfPage = pdf.addPage([595, 842]);
  pdfPage.drawText("Training plan", { font: await pdf.embedFont(StandardFonts.Helvetica), x: 40, y: 800 });
  pdfPage.drawImage(await pdf.embedJpg(jpeg), { x: 40, y: 200, width: 500, height: 375 });
  const originalPdf = await pdf.save({ useObjectStreams: false });
  const pdfResult = await processFile("with-image.pdf", originalPdf);
  check(pdfResult.before > 1_000_000 && pdfResult.after <= 1_000_000 && !pdfResult.note, "PDF JPEG images are compressed without rasterising pages");
  const before = await PDFDocument.load(originalPdf), after = await PDFDocument.load(await processedBytes());
  const contents = document => document.getPage(0).node.Contents().asArray().map(ref => [...document.context.lookup(ref, PDFRawStream).getContents()]);
  check(JSON.stringify(contents(before)) === JSON.stringify(contents(after)), "PDF text and drawing commands remain byte-identical");
  check(after.getPageCount() === 1 && after.getPage(0).getWidth() === 595 && after.getPage(0).getHeight() === 842, "PDF page geometry is preserved");
  check(errors.length === 0, `no browser runtime errors: ${errors.join("; ")}`);
  console.log(`PASS: ${checks} production-worker browser checks; no accounts or Supabase requests.`);
} finally {
  await browser?.close();
  if (routeCreated) {
    await rm(route, { recursive: true, force: true });
    // Remove the temporary route from Next's generated TypeScript route map.
    await new Promise((ok, fail) => {
      const process = spawn(globalThis.process.execPath, [join(root, "node_modules/next/dist/bin/next"), "typegen"], { cwd: root, env: { ...globalThis.process.env, NEXT_TELEMETRY_DISABLED: "1" } });
      process.on("error", fail); process.on("close", code => code === 0 ? ok() : fail(Error("Failed to refresh Next route types")));
    });
  }
}
