import { buildA4ReportPdf, canvasToJpeg, REPORT_CANVAS_WIDTH as W, REPORT_CANVAS_HEIGHT as H } from "./report-pdf";
import type { HistoryMatrix } from "./player-profile-report";

export interface PlayerProfilePdfOptions {
  fullName: string;
  details: Array<[string, string]>;
  coachNote: string;
  coachNoteAt?: string;
  coachNoteAuthor?: string;
  rangeLabel: string;
  history: { physical: HistoryMatrix; activity: HistoryMatrix; legacyPhysical: HistoryMatrix; legacyActivity: HistoryMatrix; undatedExcluded: number };
  guardians: string[];
  photo?: Blob | null;
}

const M = 74, WIDTH = W - 2 * M, BOTTOM = 1640;
const INK = "#181a1e", MUTED = "#656b73", YELLOW = "#ffda00", GRAY = "#f5f6f8", LINE = "#e3e5e9";
function text(c: CanvasRenderingContext2D, value: string, x: number, y: number, size = 23, bold = false, color = INK) {
  c.font = `${bold ? "700" : "400"} ${size}px Arial, sans-serif`; c.fillStyle = color; c.textAlign = "left"; c.textBaseline = "top"; c.fillText(value, x, y);
}
function wrap(c: CanvasRenderingContext2D, value: string, width: number, size = 23, bold = false) {
  c.font = `${bold ? "700" : "400"} ${size}px Arial, sans-serif`;
  const lines: string[] = [];
  for (const paragraph of String(value).split(/\r?\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (c.measureText(word).width > width) {
        if (current) { lines.push(current); current = ""; }
        for (const char of word) { if (c.measureText(current + char).width > width && current) { lines.push(current); current = ""; } current += char; }
      } else if (current && c.measureText(`${current} ${word}`).width > width) { lines.push(current); current = word; }
      else current = current ? `${current} ${word}` : word;
    }
    lines.push(current);
  }
  return lines;
}
function box(c: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) {
  c.fillStyle = color; c.beginPath(); c.roundRect(x, y, width, height, 15); c.fill();
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error("Зображення тимчасово недоступне.")); }, 15000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error("Зображення тимчасово недоступне.")); };
    image.src = src;
  });
}

export async function createPlayerProfilePdf(options: PlayerProfilePdfOptions) {
  const photoUrl = options.photo ? URL.createObjectURL(options.photo) : null;
  let photo: HTMLImageElement | null = null, emblem: HTMLImageElement | null = null;
  try {
    [emblem, photo] = await Promise.all([
      loadImage("/champion-club-emblem.jpg").catch(() => null),
      photoUrl ? loadImage(photoUrl).catch(() => null) : Promise.resolve(null),
    ]);
    const canvases: HTMLCanvasElement[] = [];
    let c: CanvasRenderingContext2D, y: number;
    const newPage = () => {
      const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Браузер не підтримує формування PDF.");
      canvases.push(canvas); c = context;
      c.fillStyle = "#fff"; c.fillRect(0, 0, W, H);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
      if (emblem) c.drawImage(emblem, M, 70, 125, 125);
      text(c, "КЛУБ ЧЕМПІОН", M + 155, 74, 25, true);
      text(c, "ПРОФІЛЬ ГРАВЦЯ", M + 155, 116, 43, true);
      text(c, "Динаміка фізичної підготовленості та ігрової діяльності", M + 155, 177, 20, false, MUTED);
      c.fillStyle = YELLOW; c.fillRect(M, 233, WIDTH, 5);
      y = 270;
      if (canvases.length > 1) {
        for (const line of wrap(c, options.fullName, WIDTH, 25, true)) { text(c, line, M, y, 25, true); y += 31; }
        text(c, options.rangeLabel, M, y + 5, 20, false, MUTED); y += 48;
      }
    };
    const ensure = (height: number) => { if (y + height > BOTTOM) newPage(); };
    const paragraph = (title: string, body: string, caption?: string) => {
      const lines = [
        ...wrap(c, body, WIDTH - 46, 22).map((value) => ({ value, size: 22 })),
        ...(caption ? wrap(c, caption, WIDTH - 46, 19).map((value) => ({ value, size: 19 })) : []),
      ];
      let offset = 0;
      do {
        ensure(93);
        const count = Math.max(1, Math.min(lines.length - offset, Math.floor((BOTTOM - y - 64) / 29)));
        const height = 64 + count * 29;
        box(c, M, y, WIDTH, height, GRAY); c.fillStyle = YELLOW; c.fillRect(M, y, 5, height);
        text(c, title + (offset ? " · продовження" : ""), M + 22, y + 14, 24, true);
        lines.slice(offset, offset + count).forEach((line, index) => text(c, line.value, M + 22, y + 52 + index * 29, line.size, false, MUTED));
        y += height + 25; offset += count;
      } while (offset < lines.length);
    };
    newPage();
    const nameLines = wrap(c!, options.fullName, WIDTH - 245, 33, true);
    const pairs = options.details.map(([label, value]) => wrap(c!, `${label}: ${value}`, (WIDTH - 265) / 2, 21));
    const detailsHeight = Array.from({ length: Math.ceil(pairs.length / 2) }, (_, row) => Math.max(pairs[row * 2]?.length ?? 0, pairs[row * 2 + 1]?.length ?? 0) * 27 + 12).reduce((a, b) => a + b, 0);
    const height = Math.max(222, 54 + nameLines.length * 39 + detailsHeight);
    box(c!, M, y!, WIDTH, height, GRAY);
    nameLines.forEach((line, i) => text(c!, line, M + 25, y! + 23 + i * 39, 33, true));
    let detailY = y! + 38 + nameLines.length * 39;
    for (let i = 0; i < pairs.length; i += 2) {
      for (let j = 0; j < 2; j++) pairs[i + j]?.forEach((line, k) => text(c!, line, M + 25 + j * (WIDTH - 245) / 2, detailY + k * 27, 21));
      detailY += Math.max(pairs[i]?.length ?? 0, pairs[i + 1]?.length ?? 0) * 27 + 12;
    }
    const px = W - M - 202, py = y! + 24, ps = 178;
    if (photo) {
      const scale = Math.min(ps / photo.naturalWidth, ps / photo.naturalHeight);
      const iw = photo.naturalWidth * scale, ih = photo.naturalHeight * scale;
      c!.drawImage(photo, px + (ps - iw) / 2, py + (ps - ih) / 2, iw, ih);
    } else {
      box(c!, px, py, ps, ps, "#e7e9ed"); text(c!, "Фото не", px + 34, py + 62, 21, false, MUTED); text(c!, "завантажено", px + 18, py + 91, 21, false, MUTED);
    }
    y! += height + 24;
    text(c!, `Період експорту: ${options.rangeLabel}`, M, y!, 22); y! += 47;
    const noteCaption = [options.coachNoteAt ? `Оновлено: ${options.coachNoteAt}` : "", options.coachNoteAuthor].filter(Boolean).join(" · ");
    paragraph("Коротка характеристика тренера", options.coachNote || "Характеристику не внесено.", noteCaption);

    const table = (title: string, subtitle: string, matrix: HistoryMatrix) => {
      if (!matrix.columns.length) { paragraph(title, "Дані за вибраний період не внесено."); return; }
      for (let offset = 0; offset < matrix.columns.length; offset += 3) {
        const columns = matrix.columns.slice(offset, offset + 3);
        const labelWidth = 482, valueWidth = (WIDTH - labelWidth) / columns.length;
        const header = () => {
          ensure(190); text(c, title + (offset ? " · продовження" : ""), M, y, 29, true); y += 42;
          text(c, subtitle, M, y, 20, false, MUTED); y += 36;
          c.fillStyle = INK; c.fillRect(M, y, WIDTH, 62);
          text(c, "Показник / одиниця", M + 17, y + 18, 22, true, "#fff");
          columns.forEach((label, i) => {
            const lines = wrap(c, label, valueWidth - 24, 21, true);
            const color = offset + i === matrix.columns.length - 1 ? YELLOW : "#fff";
            // Long legacy period labels are rendered as a paragraph before the table.
            text(c, lines.length > 2 ? `Період ${offset + i + 1}` : lines[0], M + labelWidth + i * valueWidth + 12, y + (lines.length > 1 ? 8 : 18), 21, true, color);
            if (lines.length === 2) text(c, lines[1], M + labelWidth + i * valueWidth + 12, y + 33, 21, true, color);
          }); y += 62;
        };
        columns.forEach((label, i) => { if (wrap(c, label, valueWidth - 24, 21, true).length > 2) paragraph(`Період ${offset + i + 1}`, label); });
        header();
        for (const row of matrix.rows) {
          const labelLines = wrap(c, row.label, labelWidth - 32, 22);
          const valueLines = columns.map((_, i) => wrap(c, row.values[offset + i], valueWidth - 26, 22));
          const rowHeight = 24 + Math.max(labelLines.length, ...valueLines.map((v) => v.length)) * 28;
          // Split long rows instead of truncating comments, metric names or repeated results.
          const maxLines = Math.max(labelLines.length, ...valueLines.map((v) => v.length));
          let lineOffset = 0;
          if (y + rowHeight > BOTTOM && rowHeight < BOTTOM - 430) { newPage(); header(); }
          do {
            if (y + 52 > BOTTOM) { newPage(); header(); }
            const count = Math.max(1, Math.min(maxLines - lineOffset, Math.floor((BOTTOM - y - 24) / 28)));
            const rh = 24 + count * 28;
            c.fillStyle = GRAY; c.fillRect(M, y, WIDTH, rh);
            if (offset + columns.length === matrix.columns.length) { c.fillStyle = "#fff8d4"; c.fillRect(M + labelWidth + (columns.length - 1) * valueWidth, y, valueWidth, rh); }
            labelLines.slice(lineOffset, lineOffset + count).forEach((line, k) => text(c, line, M + 16, y + 12 + k * 28, 22));
            valueLines.forEach((lines, i) => lines.slice(lineOffset, lineOffset + count).forEach((line, k) => text(c, line, M + labelWidth + i * valueWidth + 13, y + 12 + k * 28, 22, offset + i === matrix.columns.length - 1)));
            c.strokeStyle = LINE; c.lineWidth = 1; c.strokeRect(M, y, WIDTH, rh); y += rh; lineOffset += count;
          } while (lineOffset < maxLines);
        }
        y += 24;
      }
    };
    table("Фізична підготовленість", "Кожна колонка — фактична дата тестування", options.history.physical);
    table("Ігрова діяльність", "Кожна колонка — фактична дата оцінювання", options.history.activity);
    if (options.history.legacyPhysical.columns.length) table("Фізичні тести без точної дати", "Початкові позначки збережено; точна дата невідома", options.history.legacyPhysical);
    if (options.history.legacyActivity.columns.length) table("Історичні ігрові оцінки без точної дати", "Початкові періоди збережено; точна дата невідома", options.history.legacyActivity);
    if (options.history.undatedExcluded) paragraph("Записи без точної дати", `${options.history.undatedExcluded} записів не можна віднести до вибраного року або дат. Вони доступні при виборі «Уся історія».`);
    paragraph("Контакти батьків", options.guardians.length ? options.guardians.join("\n") : "Контакти не внесено.");
    const generated = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "short" }).format(new Date());
    const pages: Uint8Array[] = [];
    for (let i = 0; i < canvases.length; i++) {
      const ctx = canvases[i].getContext("2d")!;
      text(ctx, "— результат не внесено. Попередні результати зберігаються.", M, 1649, 18, false, MUTED);
      ctx.fillStyle = LINE; ctx.fillRect(M, 1684, WIDTH, 2);
      text(ctx, `Сформовано: ${generated}`, M, 1701, 19, false, MUTED);
      text(ctx, `${i + 1} / ${canvases.length}`, W - M - 75, 1701, 19, false, MUTED);
      pages.push(await canvasToJpeg(canvases[i]));
    }
    return { pdf: buildA4ReportPdf(pages), photoUnavailable: Boolean(options.photo && !photo), emblemUnavailable: !emblem };
  } finally { if (photoUrl) URL.revokeObjectURL(photoUrl); }
}
