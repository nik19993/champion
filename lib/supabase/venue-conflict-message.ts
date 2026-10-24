import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateTime } from "../domain/format.ts";
import { VENUE_PART_LABELS, venuePartsOverlap, type VenueBookingConflict, type VenuePart } from "../domain/venue-booking.ts";

// Re-read after a rejected save: another coach may have booked since the last poll.
export async function venueConflictMessage(client: SupabaseClient, venueId: string, startAt: string, minutes: number, part: VenuePart, excludeEventId: string | null, fallback: string) {
  if (!venueId) return fallback;
  try {
    const { data, error } = await client.rpc("venue_booking_conflicts", {
      p_venue_id: venueId, p_start_at: startAt, p_duration_minutes: minutes, p_exclude_event_id: excludeEventId,
    });
    if (error || !Array.isArray(data)) return fallback;
    const rows = (data as VenueBookingConflict[]).filter(row => venuePartsOverlap(part, row.venue_part));
    if (!rows.length) return fallback;
    return `Конфлікт бронювання: ${rows.map(row => `${VENUE_PART_LABELS[row.venue_part]} · ${formatDateTime(row.start_at)} — ${formatDateTime(row.ends_at)}${row.group_code ? ` · ${row.group_code}` : ""}`).join("; ")}. Виберіть іншу частину поля або час.`;
  } catch { return fallback; }
}
