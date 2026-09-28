import JSZip from "npm:jszip@3.10.1";
import * as XLSX from "npm:xlsx@0.18.5";
import { corsHeaders, json } from "../_shared/http.ts";
import { requireAdmin } from "../_shared/admin.ts";

type Dataset = "players" | "physical_tests" | "game_activity" | "tasks" | "terminology";
type CandidateTable = { source: string; rows: string[][] };

const required: Record<Dataset, string[]> = {
  players: ["group", "full_name", "birth_year"],
  physical_tests: ["group", "player", "date", "metric", "field", "value"],
  game_activity: ["group", "player", "period", "metric", "value"],
  tasks: ["phase", "level", "age_from", "age_to", "title"],
  terminology: ["term", "definition", "category"],
};

const aliases: Record<string, string> = {
  команда: "group",
  група: "group",
  піб: "full_name",
  прізвище_імя: "full_name",
  рік_народження: "birth_year",
  амплуа: "position",
  гравець: "player",
  дата: "date",
  показник: "metric",
  тест: "metric",
  поле_результату: "field",
  складова_тесту: "field",
  вимір: "field",
  значення: "value",
  одиниця: "unit",
  час: "time",
  температура: "temperature_c",
  температура_c: "temperature_c",
  погода: "weather",
  вітер: "wind",
  місце: "venue",
  локація: "venue",
  покриття: "surface",
  взуття: "footwear",
  примітки_сесії: "session_notes",
  період: "period",
  фаза: "phase",
  рівень: "level",
  вік_від: "age_from",
  вік_до: "age_to",
  назва: "title",
  компонент: "component",
  опис: "description",
  термін: "term",
  визначення: "definition",
  категорія: "category",
  джерело: "source",
};

const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function normalizeHeader(value: string) {
  const normalized = value.trim().toLocaleLowerCase("uk-UA").replaceAll(/\s+/g, "_");
  return aliases[normalized] ?? normalized;
}

function isExampleRow(row: string[]) {
  return row.some((value) => value.trim().toLocaleUpperCase("uk-UA").startsWith("ПРИКЛАД"));
}

const sessionFields = [
  "time",
  "temperature_c",
  "weather",
  "wind",
  "venue",
  "surface",
  "footwear",
  "session_notes",
];

const fieldLabels: Record<string, string> = {
  group: "Команда",
  full_name: "ПІБ",
  birth_year: "Рік народження",
  player: "Гравець",
  date: "Дата",
  metric: "Тест або показник",
  field: "Поле результату",
  value: "Значення",
  period: "Період",
  phase: "Фаза",
  level: "Рівень",
  age_from: "Вік від",
  age_to: "Вік до",
  title: "Назва",
  term: "Термін",
  definition: "Визначення",
  category: "Категорія",
};

function normalizeDate(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const local = /^(\d{1,2})[.\/]([0-1]?\d)[.\/](\d{4})$/.exec(raw);
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  const serial = Number(raw.replace(",", "."));
  if (Number.isFinite(serial) && serial >= 1 && serial <= 100000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
  }
  return raw;
}

function collectSessionMetadata(candidates: CandidateTable[]) {
  const sessions = new Map<string, Record<string, string>>();
  const datesByGroup = new Map<string, Set<string>>();
  function addSession(values: Record<string, string>) {
    values.date = normalizeDate(values.date ?? "");
    if (!values.group || !values.date) return;
    const groupKey = values.group.toLocaleLowerCase("uk-UA");
    sessions.set(`${groupKey}|${values.date}`, values);
    const dates = datesByGroup.get(groupKey) ?? new Set<string>();
    dates.add(values.date);
    datesByGroup.set(groupKey, dates);
  }
  for (const candidate of candidates) {
    const headerIndex = candidate.rows.slice(0, 12).findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return headers.includes("group")
        && headers.includes("date")
        && sessionFields.some((field) => headers.includes(field));
    });
    if (headerIndex >= 0) {
      const headers = candidate.rows[headerIndex].map(normalizeHeader);
      for (const row of candidate.rows.slice(headerIndex + 1)) {
        if (!row.some((value) => value.trim())) continue;
        const values: Record<string, string> = {};
        headers.forEach((header, index) => {
          if (header) values[header] = String(row[index] ?? "").trim();
        });
        addSession(values);
      }
    }

    const vertical: Record<string, string> = {};
    for (const row of candidate.rows) {
      if (row.length < 2) continue;
      const key = normalizeHeader(row[0] ?? "");
      if (["group", "date", ...sessionFields].includes(key)) {
        vertical[key] = String(row[1] ?? "").trim();
      }
    }
    if (vertical.group && vertical.date && sessionFields.some((field) => vertical[field])) addSession(vertical);
  }
  return { sessions, datesByGroup };
}

function rowsForDataset(candidates: CandidateTable[], dataset: Dataset, defaultDate = "") {
  const sessionMetadata = dataset === "physical_tests"
    ? collectSessionMetadata(candidates)
    : { sessions: new Map<string, Record<string, string>>(), datesByGroup: new Map<string, Set<string>>() };
  for (const candidate of candidates) {
    const headerIndex = candidate.rows.slice(0, 12).findIndex((row) => {
      const headers = row.map(normalizeHeader);
      return required[dataset].every((field) => headers.includes(field));
    });
    if (headerIndex < 0) continue;

    const headers = candidate.rows[headerIndex].map(normalizeHeader);
    const duplicates = headers.filter((header, index) => header && headers.indexOf(header) !== index);
    if (duplicates.length) throw new Error(`DUPLICATE_COLUMNS:${[...new Set(duplicates)].join(",")}`);

    const dataRows = candidate.rows
      .slice(headerIndex + 1)
      .filter((row) => row.some((value) => value.trim()) && !isExampleRow(row));
    if (dataRows.length > 5000) throw new Error("ROW_LIMIT_EXCEEDED");
    return dataRows.map((cells, index) => {
      const values: Record<string, string> = {};
      headers.forEach((header, cellIndex) => {
        if (header) values[header] = String(cells[cellIndex] ?? "").trim();
      });
      if (dataset === "physical_tests") {
        const groupKey = (values.group ?? "").toLocaleLowerCase("uk-UA");
        values.date = normalizeDate(values.date ?? "") || defaultDate;
        if (!values.date) {
          const metadataDates = [...(sessionMetadata.datesByGroup.get(groupKey) ?? [])];
          if (metadataDates.length === 1) values.date = metadataDates[0];
        }
        const session = sessionMetadata.sessions.get(`${groupKey}|${values.date ?? ""}`);
        if (session) {
          for (const field of sessionFields) {
            if (!values[field] && session[field]) values[field] = session[field];
          }
        }
      }
      const errors = required[dataset]
        .filter((field) => !values[field])
        .map((field) => `Не заповнено «${fieldLabels[field] ?? field}»`);
      return { row_number: headerIndex + index + 2, values, errors, warnings: [], source: candidate.source };
    });
  }
  throw new Error(`COLUMN_SET_NOT_FOUND:${required[dataset].join(",")}`);
}

function xlsxTables(buffer: ArrayBuffer): CandidateTable[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
  return workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date>>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      dateNF: "yyyy-mm-dd",
      blankrows: false,
    }).map((row) => row.map((value) => String(value ?? "").trim()));
    return [{ source: `Аркуш «${name}»`, rows }];
  });
}

function decodeXml(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function wordCellText(xml: string) {
  const prepared = xml.replaceAll(/<w:(?:tab|br)\b[^>]*\/>/g, " ");
  return [...prepared.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1]))
    .join("")
    .replaceAll(/\s+/g, " ")
    .trim();
}

async function docxTables(buffer: ArrayBuffer): Promise<CandidateTable[]> {
  const archive = await JSZip.loadAsync(buffer);
  const documentFile = archive.file("word/document.xml");
  if (!documentFile) throw new Error("INVALID_DOCX");
  const xml = await documentFile.async("string");
  return [...xml.matchAll(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g)].map((tableMatch, tableIndex) => ({
    source: `Таблиця Word ${tableIndex + 1}`,
    rows: [...tableMatch[0].matchAll(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g)].map((rowMatch) =>
      [...rowMatch[0].matchAll(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g)].map((cellMatch) => wordCellText(cellMatch[0])),
    ),
  }));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { service, adminId } = await requireAdmin(request);
    const body = await request.json() as { file_asset_id?: string; dataset?: Dataset; default_date?: string };
    if (!body.file_asset_id || !body.dataset || !required[body.dataset]) return json({ error: "INVALID_INPUT" }, 400);
    const defaultDate = normalizeDate(body.default_date ?? "");
    if (body.default_date && !/^\d{4}-\d{2}-\d{2}$/.test(defaultDate)) return json({ error: "INVALID_DEFAULT_DATE" }, 400);
    const assetResult = await service.from("file_assets").select("id, owner_id, bucket, object_path, mime_type, size_bytes, scan_status").eq("id", body.file_asset_id).single();
    const asset = assetResult.data;
    if (assetResult.error || !asset || asset.owner_id !== adminId || asset.bucket !== "imports" || asset.scan_status !== "clean" || ![xlsxMime, docxMime].includes(asset.mime_type) || asset.size_bytes > 10 * 1024 * 1024) return json({ error: "FILE_REJECTED" }, 400);
    const download = await service.storage.from(asset.bucket).download(asset.object_path);
    if (download.error) return json({ error: "DOWNLOAD_FAILED" }, 400);
    const buffer = await download.data.arrayBuffer();
    const candidates = asset.mime_type === xlsxMime ? xlsxTables(buffer) : await docxTables(buffer);
    if (!candidates.length) return json({ error: asset.mime_type === xlsxMime ? "EMPTY_WORKBOOK" : "NO_TABLES_IN_DOCX" }, 400);
    return json({ rows: rowsForDataset(candidates, body.dataset, defaultDate), format: asset.mime_type === xlsxMime ? "xlsx" : "docx" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SERVER_ERROR";
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" || code === "MFA_REQUIRED" ? 403 : code === "ROW_LIMIT_EXCEEDED" ? 413 : code === "SERVER_ERROR" ? 500 : 400;
    return json({ error: code }, status);
  }
});
