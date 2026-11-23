import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminCalendarEvent, CalendarRange } from "../domain/admin-calendar.ts";
import { combineKyivDateTime } from "../domain/format.ts";

const CALENDAR_SELECT = "id, group_id, event_type, start_at, ends_at, venue_id, booking_venue_id, venue_part, coach_id, substitute_coach_id, needs_substitute, is_rescheduled, status, coach_comment, groups(code, display_code), venues(name, parent_venue_id), coach:profiles!events_coach_id_fkey(full_name), substitute:profiles!events_substitute_coach_id_fkey(full_name)";

export async function loadAdminCalendarEvents(client: SupabaseClient, range: CalendarRange) {
  const start = combineKyivDateTime(range.start, "00:00");
  const end = combineKyivDateTime(range.end, "00:00");
  const rows: AdminCalendarEvent[] = [];
  const ids = new Set<string>();
  let expected: number | undefined;
  do {
    const result = await client.from("events").select(CALENDAR_SELECT, { count: "exact" })
      .gte("start_at", start).lt("start_at", end).order("start_at").order("id").range(rows.length, rows.length + 499);
    if (result.error || !Array.isArray(result.data) || result.count == null || !Number.isSafeInteger(result.count) || result.count < 0) {
      throw new Error("Не вдалося завантажити календар подій.");
    }
    expected ??= result.count;
    if (result.count !== expected || rows.length + result.data.length > expected || (!result.data.length && rows.length < expected)) {
      throw new Error("Розклад змінився під час завантаження. Повторіть спробу.");
    }
    for (const event of result.data as unknown as AdminCalendarEvent[]) {
      if (!event.id || ids.has(event.id) || !Number.isFinite(Date.parse(event.start_at)) || !Number.isFinite(Date.parse(event.ends_at))) {
        throw new Error("Не вдалося завантажити повний календар подій.");
      }
      ids.add(event.id);
      rows.push(event);
    }
  } while (rows.length < expected);
  return rows;
}
