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

function collectSessionMetadata(candidates: CandidateTable[]) {
  const sessions = new Map<string, Record<string, string>>();
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
        if (!values.group || !values.date) continue;
        sessions.set(`${values.group.toLocaleLowerCase("uk-UA")}|${values.date}`, values);
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
    if (vertical.group && vertical.date && sessionFields.some((field) => vertical[field])) {
      sessions.set(`${vertical.group.toLocaleLowerCase("uk-UA")}|${vertical.date}`, vertical);
    }
  }
  return sessions;
}

function rowsForDataset(candidates: CandidateTable[], dataset: Dataset) {
  const sessionMetadata = dataset === "physical_tests"
    ? collectSessionMetadata(candidates)
    : new Map<string, Record<string, string>>();
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
        const session = sessionMetadata.get(
          `${(values.group ?? "").toLocaleLowerCase("uk-UA")}|${values.date ?? ""}`,
        );
        if (session) {
          for (const field of sessionFields) {
            if (!values[field] && session[field]) values[field] = session[field];
          }
        }
      }
      const errors = required[dataset]
        .filter((field) => !values[field])
        .map((field) => `Не заповнено «${field}»`);
      return { row_number: headerIndex + index + 2, values, errors, warnings: [], source: candidate.source };
    });
  }
  throw new Error(`COLUMN_SET_NOT_FOUND:${required[dataset].join(",")}`);
}

function xlsxTables(buffer: ArrayBuffer): CandidateTable[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  return workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(sheet, {
      header: 1,
      defval: "",
      raw: false,
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
    const body = await request.json() as { file_asset_id?: string; dataset?: Dataset };
    if (!body.file_asset_id || !body.dataset || !required[body.dataset]) return json({ error: "INVALID_INPUT" }, 400);
    const assetResult = await service.from("file_assets").select("id, owner_id, bucket, object_path, mime_type, size_bytes, scan_status").eq("id", body.file_asset_id).single();
    const asset = assetResult.data;
    if (assetResult.error || !asset || asset.owner_id !== adminId || asset.bucket !== "imports" || asset.scan_status !== "clean" || ![xlsxMime, docxMime].includes(asset.mime_type) || asset.size_bytes > 10 * 1024 * 1024) return json({ error: "FILE_REJECTED" }, 400);
    const download = await service.storage.from(asset.bucket).download(asset.object_path);
    if (download.error) return json({ error: "DOWNLOAD_FAILED" }, 400);
    const buffer = await download.data.arrayBuffer();
    const candidates = asset.mime_type === xlsxMime ? xlsxTables(buffer) : await docxTables(buffer);
    if (!candidates.length) return json({ error: asset.mime_type === xlsxMime ? "EMPTY_WORKBOOK" : "NO_TABLES_IN_DOCX" }, 400);
    return json({ rows: rowsForDataset(candidates, body.dataset), format: asset.mime_type === xlsxMime ? "xlsx" : "docx" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SERVER_ERROR";
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" || code === "MFA_REQUIRED" ? 403 : code === "ROW_LIMIT_EXCEEDED" ? 413 : code === "SERVER_ERROR" ? 500 : 400;
    return json({ error: code }, status);
  }
});
