import type { EventType, MethodologyLevel, MethodologyPhase, OperationalStatus, OperationalType, UniformStatus } from "@/lib/domain/types";

export const EVENT_LABELS: Record<EventType, string> = {
  training: "Тренування",
  oblast: "Чемпіонат області",
  ukraine: "Чемпіонат України",
  tournament: "Турнір",
  theory: "Теоретичне заняття",
};

export const OPERATIONAL_TYPE_LABELS: Record<OperationalType, string> = {
  conflict: "Конфлікт",
  organizational_need: "Організаційна потреба",
  coach_substitution: "Заміна тренера",
  reschedule: "Перенесення",
  comment: "Додатковий коментар",
};

export const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, string> = {
  todo: "Потрібно зробити",
  in_progress: "В процесі",
  done: "Виконано",
};

export const UNIFORM_STATUS_LABELS: Record<UniformStatus, string> = {
  not_ordered: "Не замовлено",
  requested: "Запитано",
  preparing: "Готується",
  issued: "Видано",
};

export const PHASE_LABELS: Record<MethodologyPhase, string> = { attack: "Тактика нападу", defence: "Тактика захисту" };
export const LEVEL_LABELS: Record<MethodologyLevel, string> = { individual: "Індивідуальна", group: "Групова", team: "Командна" };

const KYIV_TIME_ZONE = "Europe/Kyiv";
const monthFormatter = new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric", timeZone: KYIV_TIME_ZONE });
const dateFormatter = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "long", year: "numeric", timeZone: KYIV_TIME_ZONE });
const dateTimeFormatter = new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: KYIV_TIME_ZONE });
const timeFormatter = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit", timeZone: KYIV_TIME_ZONE });
const kyivDateKeyFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: KYIV_TIME_ZONE });

function kyivOffsetMs(instant: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23", timeZone: KYIV_TIME_ZONE,
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - instant.getTime();
}

function kyivLocalMidnightIso(year: number, monthIndex: number, day: number) {
  const target = Date.UTC(year, monthIndex, day);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) instant = target - kyivOffsetMs(new Date(instant));
  return new Date(instant).toISOString();
}

export function kyivMonthBounds(value: Date) {
  return {
    start: kyivLocalMidnightIso(value.getFullYear(), value.getMonth(), 1),
    end: kyivLocalMidnightIso(value.getFullYear(), value.getMonth() + 1, 1),
  };
}

export function kyivDateKey(value: string | Date) {
  const parts = kyivDateKeyFormatter.formatToParts(value instanceof Date ? value : new Date(value));
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

export function formatMonth(value: string | Date) {
  const date = value instanceof Date ? value : new Date(`${value.length === 7 ? `${value}-01T12:00:00` : value}`);
  const formatted = monthFormatter.format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatDate(value: string | Date) {
  return dateFormatter.format(value instanceof Date ? value : new Date(value));
}

export function formatDateTime(value: string | Date) {
  return dateTimeFormatter.format(value instanceof Date ? value : new Date(value));
}

export function formatTime(value: string | Date) {
  return timeFormatter.format(value instanceof Date ? value : new Date(value));
}

export function toDateInput(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function toMonthInput(value = new Date()) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 7);
}

export function combineLocalDateTime(date: string, time: string) {
  return new Date(`${date}T${time || "00:00"}:00`).toISOString();
}

export function normalizedSearch(value: string) {
  return value.trim().toLocaleLowerCase("uk-UA");
}

export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `\uFEFF${headers.map(quote).join(";")}\n${rows.map((row) => headers.map((header) => quote(row[header])).join(";")).join("\n")}`;
}

export function safeError(error: unknown, fallback = "Не вдалося виконати дію.") {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    if (error.message.includes("EVENT_CONFLICT")) {
      const message = error.message.replace(/^.*EVENT_CONFLICT:?\s*/i, "Конфлікт: ");
      return message.replace(
        /(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)([+-]\d{2})(?::?(\d{2}))?/g,
        (raw, date, time, offsetHour, offsetMinute) => {
          const parsed = new Date(`${date}T${time}${offsetHour}:${offsetMinute ?? "00"}`);
          if (Number.isNaN(parsed.getTime())) return raw;
          return new Intl.DateTimeFormat("uk-UA", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Kyiv",
          }).format(parsed);
        },
      );
    }
  }
  return fallback;
}
