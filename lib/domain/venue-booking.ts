import type { Venue } from "./types";

export type VenuePart = "whole" | "left" | "right";
export interface VenueBookingConflict {
  venue_part: VenuePart;
  start_at: string;
  ends_at: string;
  group_code: string | null;
}

export const VENUE_PART_LABELS: Record<VenuePart, string> = {
  whole: "Увесь майданчик", left: "Ліва половина", right: "Права половина",
};
export const VENUE_SELECT = "id, name, venue_type, is_active, supports_half_booking, parent_venue_id, venue_part";

export function venueSupportsHalves(venue: Venue | null | undefined) {
  return Boolean(venue && (venue.venue_type === "field" || venue.venue_type === "small_pitch" || venue.supports_half_booking));
}

export function normalizeVenuePart(value: unknown): VenuePart {
  return value === "left" || value === "right" ? value : "whole";
}

export function effectiveVenuePart(venue: Venue | null | undefined, part: unknown): VenuePart {
  if (venue?.parent_venue_id) return normalizeVenuePart(venue.venue_part);
  return venueSupportsHalves(venue) ? normalizeVenuePart(part) : "whole";
}

export function venuePartsOverlap(a: VenuePart, b: VenuePart) {
  return a === "whole" || b === "whole" || a === b;
}

export function eventVenueLabel(name: string | null | undefined, part: unknown, linkedHalf = false) {
  if (!name) return "Майданчик не вказано";
  const normalized = normalizeVenuePart(part);
  // Legacy half names remain readable without a repeated suffix.
  if (normalized === "whole" || linkedHalf) return name;
  return `${name} · ${VENUE_PART_LABELS[normalized].toLocaleLowerCase("uk-UA")}`;
}
