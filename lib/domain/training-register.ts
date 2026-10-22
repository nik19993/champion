import type { EventItem } from "./types";

export interface TrainingRegisterCompletion {
  event_id?: string;
  completed_at: string | null;
  completed_by?: string | null;
  attendance_version: number;
  present_count: number;
  player_count: number;
  card_count: number;
  club_card_count?: number;
}

export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function trainingRegisterState(event: EventItem) {
  const session = relationOne(event.attendance_sessions);
  const completion = relationOne(event.training_register_completions);
  const completed = Boolean(event.attendance_sync !== "pending" && event.attendance_sync !== "unknown" && session?.completed_at && completion?.completed_at && session.server_version === completion.attendance_version);
  return { attendanceSaved: Boolean(session?.completed_at), completed, completion: completed ? completion : null };
}

export function trainingRegisterLabel(event: EventItem): string {
  if (event.attendance_sync === "pending") return "Очікує синхронізації · облік не завершено";
  if (event.attendance_sync === "unknown") return "Потрібна перевірка синхронізації";
  const state = trainingRegisterState(event);
  if (state.completion) return `✓ Облік завершено · присутні ${state.completion.present_count} із ${state.completion.player_count} · жовтих карток ${state.completion.card_count}${state.completion.club_card_count === undefined ? "" : ` · карток клубу ${state.completion.club_card_count}`}`;
  return state.attendanceSaved ? "Присутність збережена · облік не завершено" : "Присутність не збережена";
}

export function completionResult(value: unknown): TrainingRegisterCompletion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.completed_at !== "string" || !Number.isFinite(Date.parse(row.completed_at))) return null;
  for (const name of ["attendance_version", "present_count", "player_count", "card_count"]) {
    if (!Number.isInteger(row[name]) || (row[name] as number) < 0) return null;
  }
  if ((row.present_count as number) > (row.player_count as number)) return null;
  if (row.club_card_count !== undefined && (!Number.isInteger(row.club_card_count) || (row.club_card_count as number) < 0)) return null;
  return row as unknown as TrainingRegisterCompletion;
}
