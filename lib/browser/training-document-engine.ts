import { unzipSync, zipSync, type Unzipped, type Zippable } from "fflate";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { TRAINING_DOCUMENT_LIMIT, trainingDocumentInputType } from "../domain/training-document.ts";

export interface DocumentCompressionResult {
  bytes: Uint8Array;
  mime: string;
  name: string;
  attempted: true;
  note?: string;
}
interface ImageProfile { edge: number; quality: number }
interface EncodedImage { bytes: Uint8Array; width: number; height: number; mime: string }
export type RasterEncoder = (bytes: Uint8Array, mime: string, profile: ImageProfile, standalone: boolean) => Promise<EncodedImage | null>;
const PROFILES: ImageProfile[] = [{ edge: 2200, quality: 0.9 }, { edge: 1800, quality: 0.85 }, { edge: 1600, quality: 0.8 }];
const MAX_EXPANDED_DOCX = 64 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 1500;

function jpegHasExif(bytes: Uint8Array) {
  // Avoid changing the interpretation of rotation metadata inside Word/PDF.
  return new TextDecoder("latin1").decode(bytes.subarray(0, 65536)).includes("Exif\0\0");
}

function rasterDimensions(bytes: Uint8Array, mime: string): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png" && bytes.length >= 24) return [view.getUint32(16), view.getUint32(20)];
  if (mime === "image/webp" && bytes.length >= 30) {
    const tag = new TextDecoder("latin1").decode(bytes.subarray(12, 16));
    if (tag === "VP8X") return [1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)];
    if (tag === "VP8 ") return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    if (tag === "VP8L") return [1 + bytes[21] + ((bytes[22] & 0x3f) << 8), 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10)];
  }
  if (mime === "image/jpeg") {
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) return [view.getUint16(offset + 7), view.getUint16(offset + 5)];
      const length = view.getUint16(offset + 2);
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

export const encodeRaster: RasterEncoder = async (bytes, mime, profile, standalone) => {
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") return null;
  if (!standalone && mime === "image/jpeg" && jpegHasExif(bytes)) return null;
  const dimensions = rasterDimensions(bytes, mime);
  if (!dimensions || dimensions[0] * dimensions[1] > 32_000_000) return null;
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mime }));
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 32_000_000) return null;
    const scale = Math.min(1, profile.edge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    // Word and PDF keep their image formats and transparency. A standalone
    // attachment can use WebP, which is already allowed by the file validator.
    const outputType = standalone ? "image/webp" : mime;
    const blob = await canvas.convertToBlob({ type: outputType, quality: profile.quality });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height, mime: blob.type };
  } finally { bitmap.close(); }
};

function unpackDocx(bytes: Uint8Array): Unzipped {
  let expanded = 0, entries = 0;
  const names = new Set<string>();
  const files = unzipSync(bytes, { filter(file) {
    entries++;
    expanded += file.originalSize;
    if (entries > MAX_ARCHIVE_ENTRIES || expanded > MAX_EXPANDED_DOCX || !Number.isSafeInteger(file.originalSize)
      || file.originalSize < 0 || file.name.split(/[\\/]/).some(part => ["..", "__proto__", "constructor", "prototype"].includes(part))
      || file.name.startsWith("/") || names.has(file.name)) {
      throw new Error("Цей Word-файл надто складний для автоматичного стискання.");
    }
    names.add(file.name);
    return true;
  } });
  if (!files["[Content_Types].xml"] || !files["word/document.xml"]) throw new Error("Не вдалося прочитати структуру Word-файла.");
  if (Object.keys(files).some(name => /vbaproject\.bin|activex\/|embeddings\/|externallinks\//i.test(name))) {
    throw new Error("Документ містить вбудовані об’єкти, які не підтримуються.");
  }
  return files;
}

async function compressDocx(files: Unzipped, profile: ImageProfile, raster: RasterEncoder) {
  const output: Zippable = Object.create(null);
  for (const [name, source] of Object.entries(files)) {
    let bytes: Uint8Array = source;
    const mime = /\.jpe?g$/i.test(name) ? "image/jpeg" : /\.png$/i.test(name) ? "image/png" : null;
    if (name.startsWith("word/media/") && mime) {
      try {
        const image = await raster(source, mime, profile, false);
        if (image && image.mime === mime && image.bytes.length < source.length) bytes = image.bytes;
      } catch { /* Preserve an image that cannot safely be re-encoded. */ }
    }
    output[name] = [bytes, { level: mime ? 0 : 9 }];
  }
  return zipSync(output, { level: 9 });
}

async function compressPdf(source: Uint8Array, profile: ImageProfile, raster: RasterEncoder) {
  const document = await PDFDocument.load(source, { updateMetadata: false, throwOnInvalidObject: true });
  if (document.getPageCount() > 150) throw new Error("PDF має забагато сторінок для автоматичного стискання.");
  if (document.catalog.has(PDFName.of("AcroForm")) || /\/ByteRange\s*\[/.test(new TextDecoder("latin1").decode(source))) {
    throw new Error("PDF із формами або підписом зберігається без автоматичних змін.");
  }
  for (const [ref, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const dict = object.dict;
    if (dict.get(PDFName.of("Subtype")) !== PDFName.of("Image") || dict.get(PDFName.of("Filter")) !== PDFName.of("DCTDecode")
      || dict.get(PDFName.of("ColorSpace")) !== PDFName.of("DeviceRGB")
      || dict.has(PDFName.of("Mask")) || dict.has(PDFName.of("SMask")) || dict.has(PDFName.of("Decode"))
      || dict.has(PDFName.of("DecodeParms")) || dict.lookupMaybe(PDFName.of("BitsPerComponent"), PDFNumber)?.asNumber() !== 8) continue;
    try {
      const image = await raster(object.getContents(), "image/jpeg", profile, false);
      if (!image || image.mime !== "image/jpeg" || image.bytes.length >= object.getContentsSize()) continue;
      const replacement = dict.clone(document.context);
      replacement.set(PDFName.of("Width"), PDFNumber.of(image.width));
      replacement.set(PDFName.of("Height"), PDFNumber.of(image.height));
      replacement.set(PDFName.of("Length"), PDFNumber.of(image.bytes.length));
      document.context.assign(ref, PDFRawStream.of(replacement, image.bytes));
    } catch { /* Keep unsupported or colour-managed images unchanged. */ }
  }
  // Text, vector schemes, fonts and page geometry are preserved. Plain objects
  // also keep the existing server-side active-content checks effective.
  return document.save({ useObjectStreams: false, updateFieldAppearances: false, addDefaultPage: false });
}

export async function compressTrainingDocument(source: Uint8Array, name: string, raster: RasterEncoder = encodeRaster): Promise<DocumentCompressionResult> {
  const mime = trainingDocumentInputType({ name, size: source.length });
  let best = source, bestMime = mime, bestName = name;
  let note: string | undefined;
  const docx = mime.includes("wordprocessingml") ? unpackDocx(source) : null;
  if (docx && Object.keys(docx).some(path => path.startsWith("_xmlsignatures/"))) {
    if (source.length > TRAINING_DOCUMENT_LIMIT) throw new Error("Підписаний Word-файл перевищує 1 МБ. Підготуйте меншу копію без зміни підписаного оригіналу.");
    return { bytes: source, mime, name, attempted: true, note: "Файл із цифровим підписом залишено без змін." };
  }
  for (const profile of PROFILES) {
    try {
      let candidate: Uint8Array, candidateMime = mime, candidateName = name;
      if (docx) candidate = await compressDocx(docx, profile, raster);
      else if (mime === "application/pdf") candidate = await compressPdf(source, profile, raster);
      else {
        const image = await raster(source, mime, profile, true);
        if (!image) { note = "На цьому пристрої зображення не вдалося додатково стиснути."; break; }
        candidate = image.bytes; candidateMime = image.mime;
        if (candidateMime !== mime) candidateName = name.replace(/\.[^.]+$/, candidateMime === "image/webp" ? ".webp" : candidateMime === "image/png" ? ".png" : ".jpg");
      }
      if (candidate.length < best.length) { best = candidate; bestMime = candidateMime; bestName = candidateName; }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      note = /[А-Яа-яІіЇїЄєҐґ]/.test(detail) ? detail : "Додатково стиснути цей файл не вдалося.";
      break;
    }
    // Even small input files always receive the first compression attempt.
    if (best.length <= TRAINING_DOCUMENT_LIMIT) break;
  }
  if (best.length > TRAINING_DOCUMENT_LIMIT) {
    throw new Error("Після спроби стискання документ перевищує 1 МБ. Зменште кількість або розмір зображень і виберіть файл знову. Тренування можна зберегти без документа.");
  }
  return { bytes: best, mime: bestMime, name: bestName, attempted: true, note };
}
