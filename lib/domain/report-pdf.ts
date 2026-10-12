export const A4_REPORT_WIDTH_PT = 595.275591;
export const A4_REPORT_HEIGHT_PT = 841.889764;
export const REPORT_CANVAS_WIDTH = 1240;
export const REPORT_CANVAS_HEIGHT = 1754;

type ReportCell = string | number | boolean | null | undefined;

export interface TableReportPdfOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: ReportCell[][];
  columnWeights?: number[];
  emptyMessage?: string;
}

interface PreparedRow {
  lines: string[][];
  height: number;
}

const PAGE_MARGIN = 70;
const TABLE_TOP = 245;
const TABLE_BOTTOM = 1645;
const TABLE_HEADER_HEIGHT = 78;
const BODY_FONT_SIZE = 25;
const BODY_LINE_HEIGHT = 34;
const CELL_PADDING_X = 14;
const CELL_PADDING_Y = 13;

function jpegDimensions(jpeg: Uint8Array) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("Некоректна сторінка PDF-звіту.");
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < jpeg.byteLength) {
    if (jpeg[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (jpeg[offset] === 0xff) offset += 1;
    const marker = jpeg[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = (jpeg[offset] << 8) | jpeg[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > jpeg.byteLength) break;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const height = (jpeg[offset + 3] << 8) | jpeg[offset + 4];
      const width = (jpeg[offset + 5] << 8) | jpeg[offset + 6];
      if (width > 0 && height > 0) return { width, height };
    }
    offset += segmentLength;
  }
  throw new Error("Не вдалося визначити розмір сторінки PDF-звіту.");
}

export function buildA4ReportPdf(jpegPages: Uint8Array[]) {
  if (!jpegPages.length) throw new Error("Немає сторінок для PDF-звіту.");
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const objectOffsets: number[] = [];
  let byteLength = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    byteLength += bytes.byteLength;
  };
  const pushText = (value: string) => pushBytes(encoder.encode(value));
  const startObject = (id: number) => {
    objectOffsets[id] = byteLength;
    pushText(`${id} 0 obj\n`);
  };
  const finishObject = () => pushText("\nendobj\n");

  let nextObjectId = 3;
  const pageObjects = jpegPages.map((jpeg) => ({
    pageId: nextObjectId++,
    imageId: nextObjectId++,
    contentId: nextObjectId++,
    jpeg,
  }));

  pushBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  startObject(1);
  pushText("<< /Type /Catalog /Pages 2 0 R >>");
  finishObject();

  startObject(2);
  pushText(`<< /Type /Pages /Count ${pageObjects.length} /Kids [${pageObjects.map(({ pageId }) => `${pageId} 0 R`).join(" ")}] >>`);
  finishObject();

  for (const { pageId, imageId, contentId, jpeg } of pageObjects) {
    startObject(pageId);
    pushText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_REPORT_WIDTH_PT} ${A4_REPORT_HEIGHT_PT}] /Resources << /XObject << /ReportPage ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    finishObject();

    const dimensions = jpegDimensions(jpeg);
    startObject(imageId);
    pushText(`<< /Type /XObject /Subtype /Image /Width ${dimensions.width} /Height ${dimensions.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`);
    pushBytes(jpeg);
    pushText("\nendstream");
    finishObject();

    const content = `q\n${A4_REPORT_WIDTH_PT} 0 0 ${A4_REPORT_HEIGHT_PT} 0 0 cm\n/ReportPage Do\nQ`;
    startObject(contentId);
    pushText(`<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}\nendstream`);
    finishObject();
  }

  const xrefOffset = byteLength;
  const objectCount = nextObjectId - 1;
  pushText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) pushText(`${String(objectOffsets[id]).padStart(10, "0")} 00000 n \n`);
  pushText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const output = new Uint8Array(byteLength);
  let outputOffset = 0;
  for (const chunk of chunks) {
    output.set(chunk, outputOffset);
    outputOffset += chunk.byteLength;
  }
  return new Blob([output.buffer], { type: "application/pdf" });
}

function normalizedColumnWidths(headers: string[], weights?: number[]) {
  const usableWidth = REPORT_CANVAS_WIDTH - PAGE_MARGIN * 2;
  const normalized = headers.map((_, index) => {
    const value = weights?.[index];
    return typeof value === "number" && value > 0 ? value : 1;
  });
  const total = normalized.reduce((sum, value) => sum + value, 0);
  return normalized.map((value) => usableWidth * value / total);
}

function wrapText(context: CanvasRenderingContext2D, value: ReportCell, maxWidth: number, maxLines = 8) {
  const text = String(value ?? "").trim() || "—";
  const paragraphs = text.split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || context.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && current) lines.push(current);
    if (lines.length === maxLines) break;
  }
  if (lines.length === maxLines && context.measureText(lines[maxLines - 1]).width > maxWidth - 18) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines.length ? lines : ["—"];
}

export function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Не вдалося підготувати сторінку PDF-звіту."));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/jpeg", 0.94);
  });
}

function fittedTitleFont(context: CanvasRenderingContext2D, title: string, maxWidth: number) {
  let size = 48;
  while (size > 32) {
    context.font = `800 ${size}px Arial, sans-serif`;
    if (context.measureText(title).width <= maxWidth) return size;
    size -= 2;
  }
  return size;
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function prepareRows(context: CanvasRenderingContext2D, rows: ReportCell[][], widths: number[]) {
  context.font = `${BODY_FONT_SIZE}px Arial, sans-serif`;
  return rows.map<PreparedRow>((row) => {
    const lines = widths.map((width, index) => wrapText(context, row[index], width - CELL_PADDING_X * 2));
    const lineCount = Math.max(1, ...lines.map((cellLines) => cellLines.length));
    return { lines, height: Math.max(58, CELL_PADDING_Y * 2 + lineCount * BODY_LINE_HEIGHT) };
  });
}

function paginateRows(rows: PreparedRow[]) {
  if (!rows.length) return [[]] as PreparedRow[][];
  const pages: PreparedRow[][] = [[]];
  let usedHeight = TABLE_TOP + TABLE_HEADER_HEIGHT;
  for (const row of rows) {
    const current = pages[pages.length - 1];
    if (current.length && usedHeight + row.height > TABLE_BOTTOM) {
      pages.push([]);
      usedHeight = TABLE_TOP + TABLE_HEADER_HEIGHT;
    }
    pages[pages.length - 1].push(row);
    usedHeight += row.height;
  }
  return pages;
}

function drawPageHeader(context: CanvasRenderingContext2D, options: TableReportPdfOptions) {
  context.fillStyle = "#fffdf8";
  context.fillRect(0, 0, REPORT_CANVAS_WIDTH, REPORT_CANVAS_HEIGHT);
  context.fillStyle = "#4a1556";
  context.fillRect(0, 0, REPORT_CANVAS_WIDTH, 24);
  context.fillStyle = "#f7c928";
  context.fillRect(0, 24, REPORT_CANVAS_WIDTH, 10);

  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillStyle = "#211526";
  const titleSize = fittedTitleFont(context, options.title, REPORT_CANVAS_WIDTH - PAGE_MARGIN * 2);
  context.font = `800 ${titleSize}px Arial, sans-serif`;
  context.fillText(options.title, PAGE_MARGIN, 70);

  context.font = "25px Arial, sans-serif";
  context.fillStyle = "#655d68";
  if (options.subtitle) context.fillText(options.subtitle, PAGE_MARGIN, 132);
  const generatedAt = new Intl.DateTimeFormat("uk-UA", {
    timeZone: "Europe/Kyiv",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  context.fillText(`ЧЕМПІОН · сформовано ${generatedAt}`, PAGE_MARGIN, 177);
}

function drawTableHeader(context: CanvasRenderingContext2D, headers: string[], widths: number[]) {
  let x = PAGE_MARGIN;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = "700 23px Arial, sans-serif";
  for (let index = 0; index < headers.length; index += 1) {
    const width = widths[index];
    context.fillStyle = "#4a1556";
    context.fillRect(x, TABLE_TOP, width, TABLE_HEADER_HEIGHT);
    context.strokeStyle = "#ffffff";
    context.lineWidth = 2;
    context.strokeRect(x, TABLE_TOP, width, TABLE_HEADER_HEIGHT);
    context.fillStyle = "#ffffff";
    const lines = wrapText(context, headers[index], width - CELL_PADDING_X * 2, 2);
    lines.forEach((line, lineIndex) => context.fillText(line, x + CELL_PADDING_X, TABLE_TOP + 12 + lineIndex * 28));
    x += width;
  }
}

function drawPreparedRows(context: CanvasRenderingContext2D, rows: PreparedRow[], widths: number[]) {
  let y = TABLE_TOP + TABLE_HEADER_HEIGHT;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = `${BODY_FONT_SIZE}px Arial, sans-serif`;
  rows.forEach((row, rowIndex) => {
    let x = PAGE_MARGIN;
    row.lines.forEach((cellLines, cellIndex) => {
      const width = widths[cellIndex];
      context.fillStyle = rowIndex % 2 === 0 ? "#ffffff" : "#faf6fb";
      context.fillRect(x, y, width, row.height);
      context.strokeStyle = "#d9d1db";
      context.lineWidth = 1.5;
      context.strokeRect(x, y, width, row.height);
      context.fillStyle = "#241b27";
      cellLines.forEach((line, lineIndex) => context.fillText(line, x + CELL_PADDING_X, y + CELL_PADDING_Y + lineIndex * BODY_LINE_HEIGHT));
      x += width;
    });
    y += row.height;
  });
}

function drawEmptyState(context: CanvasRenderingContext2D, message: string) {
  const x = PAGE_MARGIN;
  const y = TABLE_TOP;
  const width = REPORT_CANVAS_WIDTH - PAGE_MARGIN * 2;
  const height = 280;
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#d9d1db";
  context.lineWidth = 3;
  roundedRect(context, x, y, width, height, 28);
  context.fill();
  context.stroke();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#4a1556";
  context.font = "700 38px Arial, sans-serif";
  context.fillText(message, REPORT_CANVAS_WIDTH / 2, y + height / 2);
}

function drawFooter(context: CanvasRenderingContext2D, page: number, total: number) {
  context.strokeStyle = "#dfd6e1";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(PAGE_MARGIN, 1688);
  context.lineTo(REPORT_CANVAS_WIDTH - PAGE_MARGIN, 1688);
  context.stroke();
  context.fillStyle = "#655d68";
  context.font = "22px Arial, sans-serif";
  context.textAlign = "right";
  context.textBaseline = "top";
  context.fillText(`Сторінка ${page} з ${total}`, REPORT_CANVAS_WIDTH - PAGE_MARGIN, 1703);
}

export async function createTableReportPdf(options: TableReportPdfOptions) {
  if (!options.headers.length) throw new Error("Для PDF-звіту не визначено колонки.");
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("Браузер не підтримує формування PDF-звіту.");
  const widths = normalizedColumnWidths(options.headers, options.columnWeights);
  const preparedRows = prepareRows(measureContext, options.rows, widths);
  const pages = paginateRows(preparedRows);
  const jpegPages: Uint8Array[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = REPORT_CANVAS_WIDTH;
    canvas.height = REPORT_CANVAS_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Браузер не підтримує формування PDF-звіту.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    drawPageHeader(context, options);
    if (options.rows.length) {
      drawTableHeader(context, options.headers, widths);
      drawPreparedRows(context, pages[pageIndex], widths);
    } else {
      drawEmptyState(context, options.emptyMessage ?? "Дані не внесено");
    }
    drawFooter(context, pageIndex + 1, pages.length);
    jpegPages.push(await canvasToJpeg(canvas));
  }

  return buildA4ReportPdf(jpegPages);
}
