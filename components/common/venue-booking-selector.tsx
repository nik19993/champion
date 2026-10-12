"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { Venue } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/domain/format";
import { effectiveVenuePart, VENUE_PART_LABELS, venuePartsOverlap, venueSupportsHalves, type VenueBookingConflict, type VenuePart } from "@/lib/domain/venue-booking";

interface Props {
  client: SupabaseClient;
  venues: Venue[];
  venueId: string;
  part: VenuePart;
  startAt: string | null;
  minutes: number | null;
  excludeEventId?: string | null;
  checkAvailability?: boolean;
  onVenueChange: (id: string) => void;
  onPartChange: (part: VenuePart) => void;
  onBlockedChange: (blocked: boolean) => void;
}

export function VenueBookingSelector({ client, venues, venueId, part, startAt, minutes, excludeEventId, checkAvailability = true, onVenueChange, onPartChange, onBlockedChange }: Props) {
  const [state, setState] = useState<{ key: string; rows: VenueBookingConflict[]; error: boolean } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const venue = venues.find((item) => item.id === venueId);
  const selectedPart = effectiveVenuePart(venue, part);
  const key = `${venueId}:${startAt}:${minutes}:${excludeEventId ?? ""}:${checkAvailability}:${refresh}`;
  const shouldCheck = checkAvailability && Boolean(venueId && startAt && minutes);
  const current = state?.key === key ? state : null;
  const loading = shouldCheck && !current;
  const rows = current?.rows ?? [];
  const blocked = shouldCheck && rows.some((row) => venuePartsOverlap(selectedPart, row.venue_part));

  useEffect(() => { onBlockedChange(Boolean(blocked)); }, [blocked, onBlockedChange]);
  useEffect(() => {
    if (!shouldCheck) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.resolve().then(() => client.rpc("venue_booking_conflicts", {
        p_venue_id: venueId, p_start_at: startAt, p_duration_minutes: minutes, p_exclude_event_id: excludeEventId ?? null,
      })).then(({ data, error }) => {
        if (active) setState({ key, rows: error ? [] : (data ?? []) as VenueBookingConflict[], error: Boolean(error) });
      }).catch(() => { if (active) setState({ key, rows: [], error: true }); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [client, excludeEventId, key, minutes, shouldCheck, startAt, venueId]);
  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);

  const options: VenuePart[] = venue?.parent_venue_id ? [selectedPart] : venueSupportsHalves(venue) ? ["whole", "left", "right"] : ["whole"];
  // Linked legacy entries remain selectable for existing events, while new events use the physical venue.
  const selectableVenues = venues.filter((item) => (item.is_active || item.id === venueId) && (!item.parent_venue_id || item.id === venueId));
  return <div className="span-2 venue-booking-fields">
    <label><span>Поле або майданчик</span><select aria-label="Поле або майданчик" value={venueId} onChange={(event) => onVenueChange(event.target.value)}><option value="">Не вказано</option>{selectableVenues.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? "" : " · неактивний"}</option>)}</select></label>
    {venueId && <label><span>Частина майданчика</span><select aria-label="Частина майданчика" value={selectedPart} onChange={(event) => onPartChange(event.target.value as VenuePart)}>{options.map((option) => {
      const unavailable = checkAvailability && rows.some((row) => venuePartsOverlap(option, row.venue_part));
      return <option key={option} value={option} disabled={unavailable}>{option === "whole" && (venue?.venue_type === "field" || venue?.venue_type === "small_pitch") ? "Усе поле" : VENUE_PART_LABELS[option]}{unavailable ? " — зайнято" : ""}</option>;
    })}</select></label>}
    {shouldCheck && <div className="venue-availability" role="status" aria-live="polite">
      {loading ? <p>Перевіряємо зайнятість…</p> : current?.error ? <p>Не вдалося перевірити зайнятість. Спробуйте оновити. Під час збереження сервер повторно перевірить бронювання.</p> : rows.length ? <><p>{blocked ? "Обрана частина недоступна на цей час." : "Обрана частина доступна. Інша частина має бронювання:"}</p><ul>{rows.map((row, index) => <li key={`${row.start_at}:${row.venue_part}:${index}`}>{VENUE_PART_LABELS[row.venue_part]} · {formatDateTime(row.start_at)} — {formatDateTime(row.ends_at)}{row.group_code ? ` · ${row.group_code}` : ""}</li>)}</ul></> : <p>Майданчик доступний на обраний час.</p>}
      <button type="button" className="secondary-action small" onClick={() => setRefresh((value) => value + 1)}>Оновити зайнятість</button>
    </div>}
  </div>;
}
