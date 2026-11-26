import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { PDFDocument, PDFRawStream, StandardFonts } from "pdf-lib";
import { compressTrainingDocument } from "../lib/browser/training-document-engine.ts";
import { prepareTrainingDocument } from "../lib/browser/prepare-training-document.ts";
import { TRAINING_DOCUMENT_LIMIT, trainingDocumentInputType, trainingDocumentType } from "../lib/domain/training-document.ts";

const text = strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>План тренування</w:t></w:r></w:p></w:body></w:document>');
const types = strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
const docx = (extra = {}) => zipSync({ "[Content_Types].xml": types, "word/document.xml": text, ...extra }, { level: 0 });

test("a Word file below 1 MB is still compressed while preserving its XML and parts", async () => {
  const source = docx({ "word/styles.xml": strToU8("<styles>" + "style ".repeat(40_000) + "</styles>") });
  const result = await compressTrainingDocument(source, "план.docx");
  assert.equal(result.attempted, true); assert.ok(source.length < TRAINING_DOCUMENT_LIMIT);
  assert.ok(result.bytes.length < source.length);
  const restored = unzipSync(result.bytes);
  assert.deepEqual(restored["word/document.xml"], text); assert.deepEqual(restored["[Content_Types].xml"], types);
});
test("a Word file over 1 MB can be repacked below the limit without deleting content", async () => {
  const xml = strToU8("<content>" + "План та схеми ".repeat(100_000) + "</content>");
  const source = docx({ "word/comments.xml": xml });
  assert.ok(source.length > TRAINING_DOCUMENT_LIMIT);
  const result = await compressTrainingDocument(source, "план.docx");
  assert.ok(result.bytes.length < TRAINING_DOCUMENT_LIMIT);
  assert.deepEqual(unzipSync(result.bytes)["word/comments.xml"], xml);
});
test("an incompressible Word document over 1 MB is rejected after the attempts", async () => {
  await assert.rejects(compressTrainingDocument(docx({ "word/media/data.bin": randomBytes(1_100_000) }), "план.docx"), /Після спроби стискання.*1 МБ/);
});
test("a signed Word document is kept byte-identical", async () => {
  const source = docx({ "_xmlsignatures/sig1.xml": strToU8("<Signature/>") });
  const result = await compressTrainingDocument(source, "signed.docx");
  assert.equal(result.bytes, source); assert.match(result.note, /підписом/);
});
test("image compression is attempted below the limit and never enlarges a small original", async () => {
  const source = new Uint8Array(2000); let calls = 0;
  const result = await compressTrainingDocument(source, "схема.png", async () => { calls++; return { bytes: new Uint8Array(2500), width: 10, height: 10, mime: "image/png" }; });
  assert.equal(calls, 1); assert.equal(result.bytes, source);
});
test("a large image receives a second bounded attempt and can become WebP", async () => {
  let calls = 0;
  const result = await compressTrainingDocument(new Uint8Array(1_800_000), "схема.png", async () => ({ bytes: new Uint8Array(++calls === 1 ? 1_100_000 : 900_000), width: 100, height: 100, mime: "image/webp" }));
  assert.equal(calls, 2); assert.equal(result.mime, "image/webp"); assert.equal(result.name, "схема.webp"); assert.equal(result.bytes.length, 900_000);
});
test("PDF optimisation preserves page geometry and the page content stream", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  page.drawText("Training plan", { font: await document.embedFont(StandardFonts.Helvetica) });
  const original = await document.save({ useObjectStreams: false });
  const result = await compressTrainingDocument(original, "план.pdf");
  const restored = await PDFDocument.load(result.bytes);
  assert.equal(result.attempted, true); assert.equal(restored.getPageCount(), 1);
  assert.deepEqual(restored.getPage(0).getSize(), { width: 595, height: 842 });
  assert.equal(restored.getPage(0).node.Contents().toString(), page.node.Contents().toString());
  const streams = doc => doc.getPage(0).node.Contents().asArray().map(ref => [...doc.context.lookup(ref, PDFRawStream).getContents()]);
  assert.deepEqual(streams(restored), streams(await PDFDocument.load(original)));
});
test("input may exceed 1 MB for processing, while the upload limit is exactly 1,000,000 bytes", () => {
  assert.equal(trainingDocumentInputType({ name: "план.pdf", size: 2_000_000 }), "application/pdf");
  assert.equal(trainingDocumentType({ name: "план.pdf", size: 1_000_000 }), "application/pdf");
  assert.throws(() => trainingDocumentType({ name: "план.pdf", size: 1_000_001 }), /1 МБ/);
});

function workerFixture(action) {
  const worker = { terminated: false, terminate() { this.terminated = true; }, postMessage(message) { action(this, message); } };
  return worker;
}
test("a stalled optimiser releases the UI and never permits an oversized upload", async () => {
  const worker = workerFixture(() => {});
  await assert.rejects(prepareTrainingDocument(new File([new Uint8Array(1_000_001)], "plan.pdf"), { workerFactory: () => worker, timeoutMs: 5 }), /1 МБ/);
  assert.equal(worker.terminated, true);
});
test("unavailable optimisation keeps an already small file with an explicit explanation", async () => {
  const file = new File(["%PDF-small"], "plan.pdf");
  const result = await prepareTrainingDocument(file, { workerFactory: () => { throw Error("Worker unavailable"); } });
  assert.equal(result.file, file); assert.equal(result.attempted, true); assert.match(result.note, /недоступне/);
});
test("cancelling an in-progress optimiser terminates its worker", async () => {
  const controller = new AbortController(); const worker = workerFixture(() => controller.abort());
  await assert.rejects(prepareTrainingDocument(new File(["%PDF-small"], "plan.pdf"), { signal: controller.signal, workerFactory: () => worker }), error => error.name === "AbortError");
  assert.equal(worker.terminated, true);
});
