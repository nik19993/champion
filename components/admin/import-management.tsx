"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, Upload } from "lucide-react";
import { useState } from "react";
import { Pill, StatusMessage } from "@/components/common/workspace-ui";
import { MAX_AGE_GROUP, MIN_AGE_GROUP } from "@/lib/domain/age-groups";
import { normalizeBirthDate, isMissingResult, planPlayerCompletion } from "@/lib/domain/player-import";
import { groupAge, groupCode } from "@/lib/domain/seasons";
import { safeError } from "@/lib/domain/format";
import type { FileAsset, GroupSummary, Profile } from "@/lib/domain/types";
import { uploadPrivateFile } from "@/lib/supabase/files";

type ImportDataset =
  | "players"
  | "physical_tests"
  | "game_activity"
  | "tasks"
  | "terminology";

interface PreviewRow {
  row_number: number;
  values: Record<string, string>;
  errors: string[];
  warnings: string[];
}

interface Props {
  client: SupabaseClient;
  profile: Profile;
  groups: GroupSummary[];
}

const datasetLabels: Record<ImportDataset, string> = {
  players: "Гравці",
  physical_tests: "Тестування фізичної підготовленості",
  game_activity: "Складові ігрової діяльності",
  tasks: "Навчальні завдання",
  terminology: "Термінологія",
};

const requiredFields: Record<ImportDataset, string[]> = {
  players: ["group", "full_name"],
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
  дата_народження: "birth_date",
  провідна_нога: "dominant_foot",
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
  дата_оцінювання: "period",
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

const fieldLabels: Record<string, string> = {
  group: "Команда",
  full_name: "ПІБ",
  birth_year: "Рік народження",
  birth_date: "Дата народження",
  position: "Амплуа",
  dominant_foot: "Провідна нога",
  player: "Гравець",
  date: "Дата",
  metric: "Показник",
  field: "Поле результату",
  value: "Значення",
  period: "Дата оцінювання / історичний період",
  phase: "Фаза",
  level: "Рівень",
  age_from: "Вік від",
  age_to: "Вік до",
  title: "Назва",
  term: "Термін",
  definition: "Визначення",
  category: "Категорія",
};

const universalTemplates = [
  { href: "/templates/champion-import-template.xlsx", label: "Зразок Excel", format: "XLSX" },
  { href: "/templates/champion-import-template.docx", label: "Зразок Word", format: "DOCX" },
];

const datasetExcelTemplates: Partial<Record<ImportDataset, { href: string; label: string; format: string }>> = {
  players: { href: "/templates/champion-import-players.xlsx", label: "Excel лише для гравців", format: "players-XLSX" },
  physical_tests: { href: "/templates/champion-import-physical-tests.xlsx", label: "Excel для фізичних тестів", format: "physical-XLSX" },
  game_activity: { href: "/templates/champion-import-game-activity.xlsx", label: "Excel для ігрової діяльності", format: "activity-XLSX" },
};

const templateSectionLabels: Record<ImportDataset, string> = {
  players: "Гравці",
  physical_tests: "Фізичні тести",
  game_activity: "Ігрова діяльність",
  tasks: "Навчальні завдання",
  terminology: "Термінологія",
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("uk-UA");
}

function normalizeImportDate(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const local = /^(\d{1,2})[.\/]([0-1]?\d)[.\/](\d{4})$/.exec(raw);
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  const serial = Number(raw.replace(",", "."));
  if (Number.isFinite(serial) && serial >= 1 && serial <= 100000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
  }
  return raw;
}

function uniqueMessages(messages: string[]) {
  return [...new Set(messages.filter(Boolean))];
}

function physicalBatteryAge(
  birthDate: string | null,
  birthYear: number | null,
  measuredOn: string,
) {
  const measured = /^\d{4}-\d{2}-\d{2}$/.test(measuredOn)
    ? new Date(`${measuredOn}T12:00:00Z`)
    : null;
  if (!measured || Number.isNaN(measured.getTime())) return null;
  let age: number | null = null;
  if (birthDate) {
    const birth = new Date(`${birthDate.slice(0, 10)}T12:00:00Z`);
    if (!Number.isNaN(birth.getTime())) {
      age = measured.getUTCFullYear() - birth.getUTCFullYear();
      const beforeBirthday = measured.getUTCMonth() < birth.getUTCMonth()
        || (measured.getUTCMonth() === birth.getUTCMonth()
          && measured.getUTCDate() < birth.getUTCDate());
      if (beforeBirthday) age -= 1;
    }
  } else if (birthYear) {
    age = measured.getUTCFullYear() - birthYear;
  }
  return age;
}

function normalizeHeader(value: string) {
  const key = normalized(value).replaceAll(" ", "_");
  return aliases[key] ?? key;
}

function importPreviewError(code: string) {
  if (code.includes("MFA_REQUIRED")) return "Потрібна повторна двоетапна перевірка адміністратора.";
  if (code.includes("ROW_LIMIT_EXCEEDED")) return "Один імпорт може містити не більше 5000 рядків.";
  if (code.includes("COLUMN_SET_NOT_FOUND")) return "У файлі не знайдено таблицю з обов’язковими колонками для вибраного набору даних.";
  if (code.includes("DUPLICATE_COLUMNS")) return "У таблиці повторюються назви колонок. Залиште кожну колонку лише один раз.";
  if (code.includes("NO_TABLES_IN_DOCX")) return "У документі Word немає таблиць. Скопіюйте макет із завантажуваного зразка.";
  if (code.includes("EMPTY_WORKBOOK")) return "У книзі Excel немає заповнених аркушів.";
  if (code.includes("INVALID_DEFAULT_DATE")) return "Спільна дата тестування має бути коректною календарною датою.";
  if (code.includes("FILE_REJECTED")) return "Файл відхилено: дозволені лише XLSX або DOCX до 10 МБ.";
  return "Не вдалося прочитати файл. Перевірте його формат і повторіть дію.";
}

function detectDelimiter(text: string) {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    else if (!quoted && character === ",") commas += 1;
    else if (!quoted && character === ";") semicolons += 1;
    else if (!quoted && (character === "\n" || character === "\r")) break;
  }
  return semicolons > commas ? ";" : ",";
}

export function parseDelimited(text: string, delimiter = detectDelimiter(text)) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value.length)) rows.push(row);
  if (quoted) throw new Error("CSV містить незакриті лапки.");
  return rows;
}

function validateValues(dataset: ImportDataset, values: Record<string, string>) {
  if ((dataset === "physical_tests" || dataset === "game_activity") && isMissingResult(values.value)) return [];
  if (dataset === "players" && values.birth_date) {
    const date = normalizeBirthDate(normalizeImportDate(values.birth_date));
    if (date) values.birth_date = date;
  }
  const errors = requiredFields[dataset]
    .filter((field) => !values[field]?.trim())
    .map((field) => `Не заповнено «${fieldLabels[field] ?? field}»`);

  if (dataset === "players" && values.birth_date) {
    if (!normalizeBirthDate(values.birth_date)) errors.push("Некоректна повна дата народження");
    else if (values.birth_year && Number(values.birth_year) !== Number(values.birth_date.slice(0, 4))) errors.push("Рік і дата народження не збігаються");
    else if (!values.birth_year) values.birth_year = values.birth_date.slice(0, 4);
  }
  if (dataset === "players" && values.birth_year) {
    const year = Number(values.birth_year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      errors.push("Рік народження має бути цілим числом від 2000 до 2100");
    }
  }
  if (dataset === "physical_tests" && values.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date) || Number.isNaN(Date.parse(values.date))) {
      errors.push("Дата має бути у форматі РРРР-ММ-ДД");
    }
    if (values.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.time)) {
      errors.push("Час має бути у форматі ГГ:ХХ");
    }
    if (values.temperature_c) {
      const temperature = Number(values.temperature_c.replace(",", "."));
      if (!Number.isFinite(temperature) || temperature < -50 || temperature > 60) {
        errors.push("Температура має бути числом від −50 до 60 °C");
      }
    }
  }
  if (dataset === "tasks") {
    const from = Number(values.age_from);
    const to = Number(values.age_to);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < MIN_AGE_GROUP || to > MAX_AGE_GROUP || from > to) {
      errors.push(`Віковий діапазон має бути від U${MIN_AGE_GROUP} до U${MAX_AGE_GROUP}`);
    }
  }
  return errors;
}

export function parseCsv(text: string, dataset: ImportDataset, defaultDate = ""): PreviewRow[] {
  const table = parseDelimited(text);
  if (table.length < 2) return [];
  if (table.length > 5001) throw new Error("Один імпорт може містити не більше 5000 рядків.");

  const headers = table[0].map(normalizeHeader);
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicates.length) throw new Error(`Повторюються колонки: ${[...new Set(duplicates)].join(", ")}`);

  return table.slice(1).map((cells, index) => {
    const values = Object.fromEntries(
      headers.map((header, cellIndex) => [header, cells[cellIndex] ?? ""]),
    );
    if (dataset === "physical_tests") {
      values.date = normalizeImportDate(values.date ?? "") || defaultDate;
    }
    return {
      row_number: index + 2,
      values,
      errors: uniqueMessages(validateValues(dataset, values)),
      warnings: [],
    };
  });
}

function taskPhase(value: string) {
  const key = normalized(value);
  return key === "defence" || key.includes("зах") ? "defence" : "attack";
}

function taskLevel(value: string) {
  const key = normalized(value);
  if (key === "team" || key.includes("команд")) return "team";
  if (key === "group" || key.includes("груп")) return "group";
  return "individual";
}

async function addDuplicateChecks(
  client: SupabaseClient,
  dataset: ImportDataset,
  sourceRows: PreviewRow[],
  groups: GroupSummary[],
) {
  const rows = sourceRows.map((row) => ({
    ...row,
    errors: [...row.errors],
    warnings: [...(row.warnings ?? [])],
  }));
  const seen = new Set<string>();

  if (dataset === "players") {
    const result = await client
      .from("players")
      .select("id, group_id, full_name, birth_date, birth_year, position, dominant_foot")
      .eq("is_active", true)
      .limit(5000);
    if (result.error) throw result.error;
    const existing = new Map<string, Array<Record<string, unknown>>>();
    for (const player of result.data ?? []) {
      const key = `${player.group_id}|${normalized(player.full_name)}`;
      existing.set(key, [...(existing.get(key) ?? []), player]);
    }
    for (const row of rows) {
      const group = groups.find(
        (item) => normalized(groupCode(item)) === normalized(row.values.group ?? ""),
      );
      if (!group) {
        row.errors.push(`Невідома команда «${row.values.group || "—"}»`);
        continue;
      }
      const key = `${group.id}|${normalized(row.values.full_name ?? "")}`;
      const matches = existing.get(key) ?? [];
      if (matches.length > 1) row.errors.push("Є кілька гравців із таким ПІБ. Потрібне ручне уточнення.");
      else if (matches.length === 1) {
        const plan = planPlayerCompletion(matches[0], row.values);
        if (plan.conflicts.length) row.errors.push(`Існуючі дані відрізняються: ${plan.conflicts.map((field) => fieldLabels[field] ?? field).join(", ")}. Перевірте профіль вручну.`);
        row.warnings.push(Object.keys(plan.updates).length ? `Буде доповнено: ${Object.keys(plan.updates).map((field) => fieldLabels[field] ?? field).join(", ")}` : "Дані вже внесено; повторний запис не створюється");
      } else if (!row.values.birth_year && !row.values.birth_date) row.errors.push("Для нового гравця вкажіть рік або повну дату народження");
      if (seen.has(key)) row.errors.push("Дублікат у цьому файлі");
      seen.add(key);
    }
  } else if (dataset === "physical_tests" || dataset === "game_activity") {
    const metricKind = dataset === "physical_tests" ? "physical_preparedness" : "game_activity";
    const [playerResult, metricResult] = await Promise.all([
      client
        .from("players")
        .select("id, group_id, full_name, birth_date, birth_year")
        .eq("is_active", true)
        .limit(5000),
      client
        .from("evaluation_metrics")
        .select("id, name, age_from, age_to")
        .eq("kind", metricKind)
        .eq("is_active", true)
        .limit(5000),
    ]);
    if (playerResult.error) throw playerResult.error;
    if (metricResult.error) throw metricResult.error;
    const allowedMetrics = metricResult.data ?? [];
    const fieldResult = dataset === "physical_tests"
      ? await client
          .from("evaluation_metric_fields")
          .select("metric_id, label")
          .eq("is_active", true)
          .limit(5000)
      : null;
    if (fieldResult?.error) throw fieldResult.error;
    const allowedFields = fieldResult?.data ?? [];
    const byGroupAndName = new Map<
      string,
      Array<{
        id: string;
        group_id: string;
        full_name: string;
        birth_date: string | null;
        birth_year: number | null;
      }>
    >();
    for (const player of playerResult.data ?? []) {
      const key = `${player.group_id}|${normalized(player.full_name)}`;
      byGroupAndName.set(key, [...(byGroupAndName.get(key) ?? []), player]);
    }

    let existing: Map<string, string>;
    if (dataset === "physical_tests") {
      const result = await client
        .from("physical_test_results")
        .select("player_id, measured_on, metric_name, field_name, value")
        .limit(10000);
      if (result.error) throw result.error;
      existing = new Map(
        (result.data ?? []).map((entry) => [`${entry.player_id}|${entry.measured_on}|${normalized(entry.metric_name)}|${normalized(entry.field_name)}`, entry.value]),
      );
    } else {
      const result = await client
        .from("game_activity_results")
        .select("player_id, period, metric_name, value")
        .limit(10000);
      if (result.error) throw result.error;
      existing = new Map(
        (result.data ?? []).map((entry) => [`${entry.player_id}|${entry.period}|${normalized(entry.metric_name)}`, entry.value]),
      );
    }

    for (const row of rows) {
      if (isMissingResult(row.values.value)) { row.errors = []; row.warnings.push("Результат відсутній — рядок буде пропущено, нуль не записується."); continue; }
      const group = groups.find(
        (item) => normalized(groupCode(item)) === normalized(row.values.group ?? ""),
      );
      if (!group) {
        row.errors.push(`Невідома команда «${row.values.group || "—"}»`);
        continue;
      }
      const matches = byGroupAndName.get(
        `${group.id}|${normalized(row.values.player ?? "")}`,
      ) ?? [];
      if (!matches.length) {
        row.errors.push("Гравця з таким ПІБ не знайдено у вказаній команді");
        continue;
      }
      if (matches.length > 1) {
        row.errors.push("У команді є кілька активних гравців із таким ПІБ");
        continue;
      }
      const batteryAge = dataset === "physical_tests"
        ? groupAge(group) ?? physicalBatteryAge(
            matches[0].birth_date,
            matches[0].birth_year,
            row.values.date ?? "",
          )
        : null;
      if (dataset === "physical_tests" && batteryAge === null) {
        row.errors.push("Для воротарської групи вкажіть дату або рік народження гравця");
      }
      const matchingMetric = allowedMetrics.find((metric) => {
        if (normalized(metric.name) !== normalized(row.values.metric ?? "")) return false;
        if (dataset === "game_activity") return true;
        if (metric.age_from === null || metric.age_to === null) return true;
        return batteryAge !== null && batteryAge >= metric.age_from && batteryAge <= metric.age_to;
      });
      if (!matchingMetric) {
        row.errors.push(
          dataset === "physical_tests" && batteryAge !== null
            ? `Тест відсутній в активному наборі U${batteryAge}`
            : "Показник відсутній в активному довіднику адміністратора",
        );
      } else if (
        dataset === "physical_tests"
        && !allowedFields.some((field) => (
          field.metric_id === matchingMetric.id
          && normalized(field.label) === normalized(row.values.field ?? "")
        ))
      ) {
        row.errors.push(`Поле «${row.values.field || "—"}» не належить тесту «${matchingMetric.name}»`);
      }
      const key =
        dataset === "physical_tests"
          ? `${matches[0].id}|${row.values.date}|${normalized(row.values.metric ?? "")}|${normalized(row.values.field ?? "")}`
          : `${matches[0].id}|${row.values.period}|${normalized(row.values.metric ?? "")}`;
      if (existing.has(key)) {
        if (existing.get(key)?.trim() === row.values.value?.trim()) row.warnings.push("Цей результат уже внесено; повторний запис буде пропущено.");
        else row.errors.push("За цією датою/періодом уже є інший результат. Перевірте його вручну.");
      }
      if (seen.has(key)) row.errors.push("Дублікат у цьому файлі");
      seen.add(key);
    }
  } else if (dataset === "tasks") {
    const result = await client
      .from("methodology_tasks")
      .select("phase, level, title, age_from, age_to")
      .eq("is_active", true)
      .limit(5000);
    if (result.error) throw result.error;
    const existing = new Set(
      (result.data ?? []).map(
        (task) =>
          `${task.phase}|${task.level}|${normalized(task.title)}|${task.age_from}|${task.age_to}`,
      ),
    );
    for (const row of rows) {
      const key = `${taskPhase(row.values.phase ?? "")}|${taskLevel(row.values.level ?? "")}|${normalized(row.values.title ?? "")}|${row.values.age_from}|${row.values.age_to}`;
      if (existing.has(key)) row.errors.push("Таке активне навчальне завдання вже існує");
      if (seen.has(key)) row.errors.push("Дублікат у цьому файлі");
      seen.add(key);
    }
  } else {
    const result = await client.from("terminology_entries").select("term").limit(5000);
    if (result.error) throw result.error;
    const existing = new Set((result.data ?? []).map((entry) => normalized(entry.term)));
    for (const row of rows) {
      const key = normalized(row.values.term ?? "");
      if (existing.has(key)) row.warnings.push("Існуючий термін буде оновлено");
      if (seen.has(key)) row.errors.push("Термін повторюється в цьому файлі");
      seen.add(key);
    }
  }
  return rows.map((row) => ({
    ...row,
    errors: uniqueMessages(row.errors),
    warnings: uniqueMessages(row.warnings),
  }));
}

export function EnhancedImportManagement({ client, profile, groups }: Props) {
  const [dataset, setDataset] = useState<ImportDataset>("players");
  const [physicalTestDate, setPhysicalTestDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  async function preview() {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      let previewRows: PreviewRow[];
      let asset: FileAsset | null = null;
      if (file.name.toLocaleLowerCase("uk-UA").endsWith(".csv")) {
        previewRows = parseCsv(await file.text(), dataset, physicalTestDate);
      } else {
        asset = await uploadPrivateFile(client, file, {
          bucket: "imports",
          ownerId: profile.id,
          contextType: `import_${dataset}`,
        });
        const result = await client.functions.invoke("import-preview", {
          body: { file_asset_id: asset.id, dataset, default_date: dataset === "physical_tests" ? physicalTestDate || undefined : undefined },
        });
        if (result.error) {
          let code = (result.data as { error?: string } | null)?.error;
          const context = (result.error as { context?: Response }).context;
          if (!code && context) {
            const payload = await context.clone().json().catch(() => null) as { error?: string } | null;
            code = payload?.error;
          }
          throw new Error(importPreviewError(code ?? result.error.message));
        }
        previewRows = ((result.data as { rows: PreviewRow[] }).rows ?? []).map((row) => {
          const values = dataset === "physical_tests"
            ? { ...row.values, date: normalizeImportDate(row.values.date ?? "") || physicalTestDate }
            : row.values;
          return {
            ...row,
            values,
            errors: uniqueMessages([
              ...(row.errors ?? []).filter((error) => !(dataset === "physical_tests" && values.date && /«(?:date|Дата)»/.test(error))),
              ...validateValues(dataset, values),
            ]),
            warnings: uniqueMessages(row.warnings ?? []),
          };
        });
      }

      previewRows = await addDuplicateChecks(client, dataset, previewRows, groups);
      const errorCount = previewRows.filter((row) => row.errors.length).length;
      const job = await client
        .from("import_jobs")
        .insert({
          dataset,
          file_asset_id: asset?.id ?? null,
          status: "previewed",
          total_rows: previewRows.length,
          valid_rows: previewRows.length - errorCount,
          error_rows: errorCount,
          created_by: profile.id,
        })
        .select("id")
        .single();
      if (job.error) throw job.error;

      if (previewRows.length) {
        const insert = await client.from("import_rows").insert(
          previewRows.map((row) => ({
            import_job_id: job.data.id,
            row_number: row.row_number,
            payload: row.values,
            errors: row.errors,
            warnings: row.warnings,
            is_valid: !row.errors.length,
          })),
        );
        if (insert.error) throw insert.error;
      }

      setRows(previewRows);
      setJobId(job.data.id as string);
      if (!previewRows.length) {
        setMessage({ kind: "warning", text: "У файлі немає рядків для імпорту." });
      } else if (errorCount) {
        setMessage({
          kind: "warning",
          text: "Виправте помилки у вихідному файлі та перевірте його повторно.",
        });
      }
    } catch (error) {
      setMessage({
        kind: "error",
        text: safeError(
          error,
          "Не вдалося прочитати файл. Для XLSX і DOCX потрібні серверні функції перевірки й попереднього перегляду.",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!jobId || rows.some((row) => row.errors.length)) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await client.rpc("confirm_import_job", { p_job_id: jobId });
      if (result.error) throw result.error;
      setMessage({ kind: "success", text: `Імпортовано ${Number(result.data ?? 0)} записів.` });
      setRows([]);
      setJobId(null);
      setFile(null);
    } catch (error) {
      setMessage({
        kind: "error",
        text: safeError(
          error,
          "Імпорт не виконано. Транзакцію скасовано, дані не змінено.",
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  const errorCount = rows.filter((row) => row.errors.length).length;
  const warningCount = rows.filter((row) => row.warnings.length).length;
  const headers = rows[0] ? Object.keys(rows[0].values) : [];
  const templateLinks = datasetExcelTemplates[dataset]
    ? [datasetExcelTemplates[dataset]!, ...universalTemplates]
    : universalTemplates;
  return (
    <div className="import-management">
      <div className="import-controls">
        <label>
          <span>Набір даних</span>
          <select
            value={dataset}
            onChange={(event) => {
              setDataset(event.target.value as ImportDataset);
              setRows([]);
              setJobId(null);
            }}
          >
            {Object.entries(datasetLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {dataset === "physical_tests" && <label>
          <span>Спільна дата тестування</span>
          <input type="date" value={physicalTestDate} onChange={(event) => { setPhysicalTestDate(event.target.value); setRows([]); setJobId(null); }} />
        </label>}
        <label>
          <span>CSV, Excel або Word</span>
          <input
            type="file"
            accept=".csv,.xlsx,.docx"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setRows([]);
              setJobId(null);
            }}
          />
        </label>
        <button
          className="primary-action"
          type="button"
          onClick={() => void preview()}
          disabled={!file || busy}
        >
          <Upload size={18} />
          {busy ? "Перевірка…" : "Перевірити файл"}
        </button>
      </div>

      <div className="import-template-help">
        <div>
          <b>Обов’язкові колонки</b>
          <p>{requiredFields[dataset].map((field) => fieldLabels[field] ?? field).join(", ")}.</p>
          <p>Заповніть аркуш або таблицю «{templateSectionLabels[dataset]}». Усі рядки «ПРИКЛАД» система пропускає автоматично — вони показують формат, а не обмежують кількість даних.</p>
          {dataset === "players" && <p>Повторний імпорт доповнює лише порожні поля наявного гравця. Порожні клітинки зберігають чинні дані. Відмінні значення потрібно перевірити та змінити у профілі вручну. Для нового гравця потрібен рік або повна дата народження; колонка «Дата народження» приймає РРРР-ММ-ДД або ДД.ММ.РРРР.</p>}
          {(dataset === "physical_tests" || dataset === "game_activity") && <p>Рисочка або порожній результат означає, що даних поки немає. Такий рядок буде пропущено; результати можна довнести пізніше. Нова дата/період зберігається окремо від попередніх.</p>}
          {dataset === "physical_tests" && <p>Шаблон містить 4 тести для кожного вікового набору, але окремий рядок для кожного поля результату: 5 полів для U6–U12 і 6 для U13–U17. Для воротарів 9–12 років використовується молодший набір, для воротарів 13–17 — старший; набір визначається за датою або роком народження гравця. Якщо всі вимірювання виконані в один день, виберіть «Спільну дату тестування» — система підставить її в усі порожні клітинки «Дата». Назви тесту та поля мають точно збігатися з довідником у «Тестування й оцінювання».</p>}
          {dataset === "game_activity" && <p>Шаблон містить усі 3 складові: лідерські якості, психоемоційну та тактико-технічну підготовленість. Для нового оцінювання в колонці «Період» або «Дата оцінювання» вкажіть фактичну дату: 2026-09-20 або 20.09.2026. У PDF вона стане окремою колонкою. Старі назви періодів підтримуються та зберігаються без вигаданої дати.</p>}
        </div>
        <div className="import-template-actions">{templateLinks.map((template) => <a className="secondary-action" href={template.href} download key={template.format}><Download size={18} />{template.label}</a>)}</div>
      </div>

      {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}

      {rows.length > 0 && (
        <>
          <div className="import-summary">
            <Pill tone="plum">{rows.length} рядків</Pill>
            <Pill tone={errorCount ? "danger" : "success"}>{errorCount} помилок</Pill>
            <Pill tone={warningCount ? "warning" : "neutral"}>
              {warningCount} попереджень
            </Pill>
          </div>
          <div className="responsive-table import-preview">
            <table>
              <thead>
                <tr>
                  <th>Рядок</th>
                  {headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                  <th>Перевірка</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row) => (
                  <tr
                    key={row.row_number}
                    className={row.errors.length ? "row-error" : ""}
                  >
                    <td>{row.row_number}</td>
                    {headers.map((header) => (
                      <td key={header}>{row.values[header]}</td>
                    ))}
                    <td>
                      {row.errors.length
                        ? row.errors.join("; ")
                        : row.warnings.length
                          ? row.warnings.join("; ")
                          : "Готово"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 100 && (
            <p className="muted">Показано перші 100 рядків із {rows.length}.</p>
          )}
          <button
            className="primary-action"
            type="button"
            onClick={() => void confirm()}
            disabled={busy || Boolean(errorCount)}
          >
            <Upload size={18} />
            Підтвердити атомарний імпорт
          </button>
        </>
      )}
    </div>
  );
}
