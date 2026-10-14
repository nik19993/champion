export interface ProfilePhysicalResult { measured_on: string | null; metric_name: string | null; field_name?: string | null; value: string | number | null; unit?: string | null; }
export interface ProfileActivityResult { period: string | null; metric_name: string | null; value: string | number | null; }
export interface ProfileExportFilter { mode: "all" | "year" | "range"; year?: string; from?: string; to?: string; }
export interface HistoryMatrix { columns: string[]; rows: Array<{ label: string; values: string[] }>; }

// The date of data entry is not the date of assessment. Only explicit calendar dates qualify.
export function assessmentDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  const local = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(raw);
  const iso = local ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}` : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

export function assessmentLabel(value: string | null | undefined) {
  const date = assessmentDate(value);
  return date ? date.split("-").reverse().join(".") : value?.trim() || "Дату не вказано";
}

export function profileExportRange(filter: ProfileExportFilter) {
  if (filter.mode === "all") return { from: null, to: null, label: "Уся історія" };
  if (filter.mode === "year") {
    if (!/^(19|20|21)\d{2}$/.test(filter.year ?? "")) throw new Error("Вкажіть рік із чотирьох цифр (1900–2199).");
    return { from: `${filter.year}-01-01`, to: `${filter.year}-12-31`, label: `${filter.year} рік` };
  }
  const from = assessmentDate(filter.from), to = assessmentDate(filter.to);
  if (!from || !to || from > to) throw new Error("Вкажіть початок і кінець періоду; початок має бути не пізніше кінця.");
  return { from, to, label: `${assessmentLabel(from)} – ${assessmentLabel(to)}` };
}

interface MatrixEntry { column: string; key: string; label: string; value: string | number | null; }
function matrix(entries: MatrixEntry[], dated: boolean): HistoryMatrix {
  const columns = [...new Set(entries.map((item) => item.column))].sort((a, b) => a.localeCompare(b, "uk-UA"));
  const metrics = new Map<string, { label: string; values: Map<string, Set<string>> }>();
  for (const item of entries) {
    const row = metrics.get(item.key) ?? { label: item.label, values: new Map<string, Set<string>>() };
    const values = row.values.get(item.column) ?? new Set<string>();
    const value = item.value == null ? "" : String(item.value).trim();
    if (value && !/^[–—-]$/.test(value)) values.add(value);
    row.values.set(item.column, values); metrics.set(item.key, row);
  }
  return {
    columns: columns.map((value) => dated ? assessmentLabel(value) : value),
    rows: [...metrics.values()].map((row) => ({ label: row.label, values: columns.map((column) => [...(row.values.get(column) ?? [])].join(" / ") || "—") })),
  };
}

export function playerProfileHistory(tests: ProfilePhysicalResult[], activity: ProfileActivityResult[], filter: ProfileExportFilter) {
  const range = profileExportRange(filter);
  const physical: MatrixEntry[] = [], game: MatrixEntry[] = [], legacyTests: MatrixEntry[] = [], legacyGame: MatrixEntry[] = [];
  let undatedExcluded = 0;
  const inRange = (date: string) => !range.from || (date >= range.from && date <= range.to!);
  for (const test of tests) {
    const date = assessmentDate(test.measured_on);
    const metric = test.metric_name?.trim() || "Тест не вказано";
    const field = test.field_name?.trim() || "";
    const unit = test.unit?.trim() || "";
    const entry = { column: date ?? (test.measured_on?.trim() || "Дата невідома"), key: JSON.stringify([metric, field, unit]), label: [metric, field && !metric.toLocaleLowerCase("uk-UA").includes(field.toLocaleLowerCase("uk-UA")) ? field : ""].filter(Boolean).join(" · ") + (unit ? `, ${unit}` : ""), value: test.value };
    if (date) { if (inRange(date)) physical.push(entry); }
    else if (filter.mode === "all") legacyTests.push(entry); else undatedExcluded++;
  }
  for (const item of activity) {
    const date = assessmentDate(item.period);
    const metric = item.metric_name?.trim() || "Показник не вказано";
    const entry = { column: date ?? (item.period?.trim() || "Період невідомий"), key: metric, label: metric, value: item.value };
    if (date) { if (inRange(date)) game.push(entry); }
    else if (filter.mode === "all") legacyGame.push(entry); else undatedExcluded++;
  }
  return { physical: matrix(physical, true), activity: matrix(game, true), legacyPhysical: matrix(legacyTests, false), legacyActivity: matrix(legacyGame, false), undatedExcluded, range };
}
