"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { EmptyState, LoadingState, StatusMessage } from "@/components/common/workspace-ui";
import { eventVenueLabel } from "@/lib/domain/venue-booking";

type Slot = { weekday: number; start_time: string; end_time: string | null };
type Location = {
  id: string;
  school_number: number;
  group_name: string | null;
  coach_names: string[];
  weekly_slots: Slot[];
};
type Class = Slot & {
  id: string;
  group_code: string;
  coach_name: string | null;
  venue_name: string | null;
  venue_part: "whole" | "left" | "right" | null;
};
type ScheduleRow = {
  id: string;
  location: string;
  group: string | null;
  coaches: string | null;
  times: string[];
};

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function timeLabel(slot: Slot) {
  const start = slot.start_time.slice(0, 5);
  return slot.end_time ? `${start}–${slot.end_time.slice(0, 5)}` : start;
}

function weekLabels(slots: Slot[]) {
  const timesByDay = new Map<number, string[]>();
  for (const slot of slots) {
    const times = timesByDay.get(slot.weekday) ?? [];
    times.push(timeLabel(slot));
    timesByDay.set(slot.weekday, times);
  }

  const daysByTime = new Map<string, string[]>();
  for (const [day, times] of [...timesByDay].sort(([left], [right]) => left - right)) {
    const key = times.sort().join(", ");
    const days = daysByTime.get(key) ?? [];
    days.push(weekdays[day - 1]);
    daysByTime.set(key, days);
  }
  return [...daysByTime].map(([times, days]) => `${days.join(", ")} — ${times}`);
}

export function AdminPlanSchedule({ client, kind }: { client: SupabaseClient; kind: "classes" | "locations" }) {
  const [rows, setRows] = useState<ScheduleRow[] | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const isLocations = kind === "locations";
  const title = isLocations ? "Розклад локацій" : "Розклад занять";

  useEffect(() => {
    let current = true;

    async function load() {
      if (kind === "locations") {
        const { data, error } = await client
          .from("location_schedule_entries")
          .select("id, school_number, group_name, coach_names, weekly_slots")
          .order("school_number")
          .order("sort_order")
          .order("id");
        if (error) throw error;
        return ((data ?? []) as Location[]).map((item): ScheduleRow => ({
          id: item.id,
          location: `Школа № ${item.school_number}`,
          group: item.group_name,
          coaches: item.coach_names.join(" та "),
          times: weekLabels(item.weekly_slots),
        }));
      }

      const { data, error } = await client.rpc("list_club_weekly_schedule");
      if (error) throw error;
      return ((data ?? []) as Class[]).map((item): ScheduleRow => ({
        id: item.id,
        location: item.venue_name ? eventVenueLabel(item.venue_name, item.venue_part) : "Майданчик не вказано",
        group: item.group_code,
        coaches: item.coach_name,
        times: weekLabels([item]),
      }));
    }

    void load().then((result) => {
      if (current) setRows(result);
    }).catch(() => {
      if (current) setError(true);
    });
    return () => { current = false; };
  }, [client, kind, revision]);

  if (error) {
    return <section className="panel-section" aria-label={title}>
      <StatusMessage kind="error">Не вдалося завантажити розклад.</StatusMessage>
      <button className="secondary-action retry-action" type="button" onClick={() => {
        setError(false);
        setRows(null);
        setRevision((value) => value + 1);
      }}>Повторити завантаження</button>
    </section>;
  }
  if (rows === null) return <LoadingState label="Завантажуємо розклад…" />;
  if (!rows.length) return <EmptyState title="Розклад ще не заповнено" />;

  return <section className="panel-section responsive-table" aria-label={title}>
    <table>
      <thead><tr><th scope="col">{isLocations ? "Школа" : "Майданчик"}</th><th scope="col">Група або тренери</th><th scope="col">Дні та час</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <th scope="row">{row.location}</th>
        <td>{row.group && <div><strong>{row.group}</strong></div>}{row.coaches}</td>
        <td>{row.times.map((line) => <div key={line}>{line}</div>)}</td>
      </tr>)}</tbody>
    </table>
  </section>;
}
