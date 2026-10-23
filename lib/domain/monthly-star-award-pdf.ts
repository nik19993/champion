import { MONTHLY_STAR_EMBLEM_DATA_URL, MONTHLY_STAR_MARK_DATA_URL } from "./monthly-star-award-assets.ts";

export const A5_PDF_WIDTH_PT = 419.527559;
export const A5_PDF_HEIGHT_PT = 595.275591;
export const A4_LANDSCAPE_PDF_WIDTH_PT = 841.889764;
export const A4_LANDSCAPE_PDF_HEIGHT_PT = A5_PDF_HEIGHT_PT;
export const AWARD_CANVAS_WIDTH = 1240;
export const AWARD_CANVAS_HEIGHT = 1760;

// Club player names are entered as surname, given name, then optional patronymic.
// Only the award caption is shortened; the stored profile name stays unchanged.
export function awardDisplayName(fullName: string) {
  return fullName.trim().split(/\s+/).slice(0, 2).join(" ");
}

const STAR_COLORS = ["#f6a21b", "#258b2c", "#0087c4", "#cf0878", "#e51122"];

export interface MonthlyStarAwardPage {
  fullName: string;
  groupCode: string;
  themeTitle: string;
  photo: Blob;
}

interface LoadedImage {
  image: HTMLImageElement;
  release: () => void;
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

function skewedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, skew: number) {
  context.beginPath();
  context.moveTo(x + skew, y);
  context.lineTo(x + width, y);
  context.lineTo(x + width - skew, y + height);
  context.lineTo(x, y + height);
  context.closePath();
}

function drawStar(context: CanvasRenderingContext2D, x: number, y: number, outerRadius: number, color: string, outlined = false) {
  const innerRadius = outerRadius * 0.43;
  context.save();
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + point * Math.PI / 5;
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const pointX = x + Math.cos(angle) * radius;
    const pointY = y + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
  if (outlined) {
    context.strokeStyle = color;
    context.lineWidth = Math.max(4, outerRadius * 0.13);
    context.stroke();
  } else {
    context.fillStyle = color;
    context.fill();
  }
  context.restore();
}

function drawCover(context: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, x: number, y: number, width: number, height: number, focusY = 0.44) {
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sourceX = Math.max(0, (sourceWidth - cropWidth) / 2);
  const sourceY = Math.max(0, Math.min(sourceHeight - cropHeight, sourceHeight * focusY - cropHeight / 2));
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
}

function drawContain(context: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function fittedFont(context: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, minimumSize: number, weight = 900) {
  let size = startSize;
  while (size > minimumSize) {
    context.font = `${weight} ${size}px Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  context.font = `${weight} ${minimumSize}px Arial, sans-serif`;
  return minimumSize;
}

function loadBlobImage(blob: Blob): Promise<LoadedImage> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => resolve({ image, release: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Зображення не вдалося прочитати."));
    };
    image.src = url;
  });
}

function loadEmbeddedImage(src: string): Promise<LoadedImage> {
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => resolve({ image, release: () => undefined });
    image.onerror = () => reject(new Error("Не вдалося прочитати вбудовану графіку нагороди."));
    image.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Не вдалося підготувати сторінку нагороди."));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/jpeg", 0.94);
  });
}

function drawAwardPage(context: CanvasRenderingContext2D, page: MonthlyStarAwardPage, photo: HTMLImageElement, emblem: HTMLImageElement, starMark: HTMLImageElement) {
  const width = AWARD_CANVAS_WIDTH;
  const height = AWARD_CANVAS_HEIGHT;
  context.fillStyle = "#fffdf4";
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(620, 820, 120, 620, 820, 820);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(0.62, "#fffdf5");
  glow.addColorStop(1, "#fff3b3");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#ffcf19";
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(480, 0);
  context.lineTo(0, 470);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(width, height);
  context.lineTo(width - 480, height);
  context.lineTo(width, height - 470);
  context.closePath();
  context.fill();

  context.fillStyle = "#151515";
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(150, 0);
  context.lineTo(0, 150);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(width, height);
  context.lineTo(width - 150, height);
  context.lineTo(width, height - 150);
  context.closePath();
  context.fill();

  context.save();
  context.globalAlpha = 0.7;
  context.strokeStyle = "#f3c412";
  context.lineWidth = 12;
  for (const offset of [0, 42, 84]) {
    context.beginPath();
    context.moveTo(0, 380 + offset);
    context.lineTo(410 + offset, 0);
    context.stroke();
    context.beginPath();
    context.moveTo(width, height - 380 - offset);
    context.lineTo(width - 410 - offset, height);
    context.stroke();
  }
  context.restore();

  const decorativeStars: Array<[number, number, number, boolean]> = [
    [75, 520, 40, false], [150, 650, 32, true], [105, 820, 48, false], [180, 980, 28, false],
    [1065, 765, 37, false], [1140, 835, 44, true], [1080, 1050, 32, false], [1150, 1220, 43, false],
    [90, 1250, 35, true], [170, 1370, 46, false], [1030, 1360, 34, true], [1120, 1640, 41, false],
    [360, 490, 26, false], [820, 470, 27, true], [300, 1160, 24, true], [930, 1190, 25, false],
  ];
  decorativeStars.forEach(([x, y, radius, outlined], index) => drawStar(context, x, y, radius, STAR_COLORS[index % STAR_COLORS.length], outlined));

  context.save();
  roundedRect(context, 52, 50, 250, 250, 42);
  context.clip();
  drawCover(context, emblem, 52, 50, 250, 250, 0.5);
  context.restore();
  context.strokeStyle = "#ffcf19";
  context.lineWidth = 10;
  roundedRect(context, 52, 50, 250, 250, 42);
  context.stroke();

  context.fillStyle = "#111111";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "900 154px Arial, sans-serif";
  context.fillText("ЗІРКА", 755, 145);

  context.fillStyle = "#ffd21b";
  skewedRect(context, 405, 225, 735, 150, 28);
  context.fill();
  context.fillStyle = "#111111";
  context.font = "900 105px Arial, sans-serif";
  context.fillText("МІСЯЦЯ", 770, 302);

  const themeText = page.themeTitle.trim().toLocaleUpperCase("uk-UA");
  context.fillStyle = "#171717";
  skewedRect(context, 340, 390, 800, 98, 20);
  context.fill();
  context.fillStyle = "#ffdf26";
  fittedFont(context, themeText, 725, 56, 26, 900);
  context.fillText(themeText, 740, 440);

  context.save();
  context.shadowColor = "rgba(20, 16, 8, 0.24)";
  context.shadowBlur = 40;
  context.shadowOffsetY = 20;
  context.fillStyle = "#ffffff";
  roundedRect(context, 228, 515, 784, 850, 105);
  context.fill();
  context.restore();

  context.save();
  roundedRect(context, 240, 527, 760, 826, 95);
  context.clip();
  drawCover(context, photo, 240, 527, 760, 826);
  const photoFade = context.createLinearGradient(0, 1120, 0, 1353);
  photoFade.addColorStop(0, "rgba(255,255,255,0)");
  photoFade.addColorStop(1, "rgba(255,249,220,0.48)");
  context.fillStyle = photoFade;
  context.fillRect(240, 1080, 760, 273);
  context.restore();
  context.strokeStyle = "#ffcf19";
  context.lineWidth = 13;
  roundedRect(context, 240, 527, 760, 826, 95);
  context.stroke();

  context.save();
  // White becomes neutral when compositing, so the exact supplied artwork can
  // sit naturally over the award without a white rectangle or a redrawn logo.
  context.globalCompositeOperation = "multiply";
  drawContain(context, starMark, 930, 480, 245, 245);
  context.restore();

  context.fillStyle = "#ffd21b";
  skewedRect(context, 42, 1375, 1156, 138, 30);
  context.fill();
  context.strokeStyle = "#ffffff";
  context.lineWidth = 10;
  skewedRect(context, 42, 1375, 1156, 138, 30);
  context.stroke();
  const playerName = awardDisplayName(page.fullName).toLocaleUpperCase("uk-UA");
  context.fillStyle = "#080808";
  fittedFont(context, playerName, 1030, 76, 42);
  context.fillText(playerName, 620, 1446);

  context.fillStyle = "#171717";
  skewedRect(context, 370, 1525, 500, 105, 24);
  context.fill();
  context.fillStyle = "#ffffff";
  fittedFont(context, page.groupCode.toLocaleUpperCase("uk-UA"), 390, 62, 38);
  context.fillText(page.groupCode.toLocaleUpperCase("uk-UA"), 620, 1579);
}

function jpegDimensions(jpeg: Uint8Array) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("Некоректне JPEG-зображення нагороди.");
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
  throw new Error("Не вдалося визначити розмір JPEG-зображення нагороди.");
}

export function buildA4AwardSheetsPdf(jpegSheets: Array<[Uint8Array, Uint8Array?]>) {
  if (!jpegSheets.length) throw new Error("Немає сторінок для PDF.");
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
  const sheetObjects = jpegSheets.map(([left, right]) => {
    const pageId = nextObjectId++;
    const leftImageId = nextObjectId++;
    const rightImageId = right ? nextObjectId++ : null;
    const contentId = nextObjectId++;
    return { pageId, leftImageId, rightImageId, contentId, left, right };
  });

  pushBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  startObject(1);
  pushText("<< /Type /Catalog /Pages 2 0 R >>");
  finishObject();

  startObject(2);
  pushText(`<< /Type /Pages /Count ${jpegSheets.length} /Kids [${sheetObjects.map(({ pageId }) => `${pageId} 0 R`).join(" ")}] >>`);
  finishObject();

  const writeImage = (id: number, jpeg: Uint8Array) => {
    const dimensions = jpegDimensions(jpeg);
    startObject(id);
    pushText(`<< /Type /XObject /Subtype /Image /Width ${dimensions.width} /Height ${dimensions.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`);
    pushBytes(jpeg);
    pushText("\nendstream");
    finishObject();
  };
  const horizontalMargin = (A4_LANDSCAPE_PDF_WIDTH_PT - A5_PDF_WIDTH_PT * 2) / 2;

  sheetObjects.forEach(({ pageId, leftImageId, rightImageId, contentId, left, right }) => {
    const resources = [`/AwardLeft ${leftImageId} 0 R`];
    if (rightImageId) resources.push(`/AwardRight ${rightImageId} 0 R`);
    startObject(pageId);
    pushText(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_LANDSCAPE_PDF_WIDTH_PT} ${A4_LANDSCAPE_PDF_HEIGHT_PT}] /Resources << /XObject << ${resources.join(" ")} >> >> /Contents ${contentId} 0 R >>`);
    finishObject();

    writeImage(leftImageId, left);
    if (rightImageId && right) writeImage(rightImageId, right);

    const contentParts = [
      `q\n${A5_PDF_WIDTH_PT} 0 0 ${A5_PDF_HEIGHT_PT} ${horizontalMargin} 0 cm\n/AwardLeft Do\nQ`,
    ];
    if (rightImageId) {
      contentParts.push(`q\n${A5_PDF_WIDTH_PT} 0 0 ${A5_PDF_HEIGHT_PT} ${horizontalMargin + A5_PDF_WIDTH_PT} 0 cm\n/AwardRight Do\nQ`);
    }
    const content = contentParts.join("\n");
    startObject(contentId);
    pushText(`<< /Length ${encoder.encode(content).byteLength} >>\nstream\n${content}\nendstream`);
    finishObject();
  });

  const xrefOffset = byteLength;
  const objectCount = nextObjectId - 1;
  pushText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) pushText(`${String(objectOffsets[id]).padStart(10, "0")} 00000 n \n`);
  pushText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Blob([output.buffer], { type: "application/pdf" });
}

export async function createMonthlyStarAwardPdf(pages: MonthlyStarAwardPage[]) {
  if (!pages.length) throw new Error("Немає нагород для формування PDF.");
  const [emblem, starMark] = await Promise.all([
    loadEmbeddedImage(MONTHLY_STAR_EMBLEM_DATA_URL),
    loadEmbeddedImage(MONTHLY_STAR_MARK_DATA_URL),
  ]);
  try {
    const awardsByGroup = new Map<string, Uint8Array[]>();
    for (const page of pages) {
      const loadedPhoto = await loadBlobImage(page.photo);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = AWARD_CANVAS_WIDTH;
        canvas.height = AWARD_CANVAS_HEIGHT;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Браузер не підтримує формування нагороди.");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        drawAwardPage(context, page, loadedPhoto.image, emblem.image, starMark.image);
        const groupAwards = awardsByGroup.get(page.groupCode) ?? [];
        groupAwards.push(await canvasToJpeg(canvas));
        awardsByGroup.set(page.groupCode, groupAwards);
      } finally {
        loadedPhoto.release();
      }
    }
    const sheets: Array<[Uint8Array, Uint8Array?]> = [];
    for (const groupAwards of awardsByGroup.values()) {
      for (let index = 0; index < groupAwards.length; index += 2) sheets.push([groupAwards[index], groupAwards[index + 1]]);
    }
    return buildA4AwardSheetsPdf(sheets);
  } finally {
    emblem.release();
    starMark.release();
  }
}
