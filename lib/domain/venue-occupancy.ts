import { normalizeVenuePart, venuePartsOverlap, type VenuePart } from "./venue-booking.ts";

export interface OccupancyEvent {
  id: string; venue_id: string | null; booking_venue_id: string | null;
  venue_part: VenuePart; start_at: string; ends_at: string; status: string;
}
export interface TimeInterval { start: number; end: number }

export function venueOccupiedIntervals(events: OccupancyEvent[], venueId: string, part: VenuePart, start: number, end: number): TimeInterval[] {
  const intervals: TimeInterval[] = [];
  for (const event of events) {
    if (event.status !== "scheduled" || (event.booking_venue_id ?? event.venue_id) !== venueId || !venuePartsOverlap(part, normalizeVenuePart(event.venue_part))) continue;
    const from = new Date(event.start_at).getTime(), to = new Date(event.ends_at).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error("Некоректний інтервал бронювання.");
    if (from < end && to > start) intervals.push({ start: Math.max(start, from), end: Math.min(end, to) });
  }
  return intervals.sort((a,b) => a.start-b.start || a.end-b.end);
}

export function venueFreeIntervals(occupied: TimeInterval[], start: number, end: number, minimumMinutes = 0): TimeInterval[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || !Number.isFinite(minimumMinutes) || minimumMinutes < 0) throw new Error("Некоректний період пошуку.");
  const free: TimeInterval[] = []; let cursor = start;
  for (const interval of [...occupied].sort((a,b) => a.start-b.start)) {
    if (!Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.end <= interval.start) throw new Error("Некоректний інтервал бронювання.");
    const from = Math.max(start, interval.start), to = Math.min(end, interval.end);
    if (from >= end || to <= start) continue;
    if (from > cursor && from-cursor >= minimumMinutes*60000) free.push({start:cursor,end:from});
    cursor = Math.max(cursor,to);
  }
  if (cursor < end && end-cursor >= minimumMinutes*60000) free.push({start:cursor,end});
  return free;
}
