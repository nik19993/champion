"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState, StatusMessage } from "@/components/common/workspace-ui";
import { slotTime } from "@/lib/domain/club-weekly-schedule";
import styles from "./admin-location-schedule.module.css";

type LocationSlot = { weekday: number; start_time: string; end_time: string | null };
type LocationEntry = {
  id: string;
  school_number: number;
  group_name: string | null;
  coach_names: string[];
  weekly_slots: LocationSlot[];
};

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function weekLabels(slots: LocationSlot[]) {
  const timesByDay = new Map<number, string[]>();
  for (const slot of slots) {
    const start = slotTime(slot.start_time);
    const time = slot.end_time ? `${start}–${slotTime(slot.end_time)}` : start;
    const times = timesByDay.get(slot.weekday) ?? [];
    times.push(time);
    timesByDay.set(slot.weekday, times);
  }

  const daysByTime = new Map<string, string[]>();
  for (const [day, times] of [...timesByDay].sort(([a], [b]) => a - b)) {
    const key = times.sort().join(", ");
    const days = daysByTime.get(key) ?? [];
    days.push(WEEKDAY_LABELS[day - 1]);
    daysByTime.set(key, days);
  }
  return [...daysByTime].map(([times, days]) => `${days.join(", ")} — ${times}`);
}

export function AdminLocationSchedule({ client }: { client: SupabaseClient }) {
  const [entries, setEntries] = useState<LocationEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const { data, error } = await client.from("location_schedule_entries")
        .select("id, school_number, group_name, coach_names, weekly_slots")
        .order("school_number").order("sort_order").order("id").abortSignal(signal);
      if (error) throw error;
      if (!signal.aborted) setEntries((data ?? []) as LocationEntry[]);
    } catch {
      if (!signal.aborted) setFailed(true);
    }
  }, [client]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, attempt]);

  if (failed) {
    return <section className="panel-section" aria-label="Розклад локацій">
      <StatusMessage kind="error">Не вдалося завантажити розклад локацій.</StatusMessage>
      <button className="secondary-action retry-action" type="button" onClick={() => {
        setFailed(false);
        setAttempt((value) => value + 1);
      }}>Повторити завантаження</button>
    </section>;
  }
  if (entries === null) return <LoadingState label="Завантажуємо розклад локацій…" />;
  if (entries.length === 0) return <EmptyState title="Розклад локацій ще не заповнено" />;

  return <section className={`responsive-table ${styles.locations}`} aria-label="Розклад локацій">
    <table className={styles.table}>
      <thead><tr><th scope="col">Школа</th><th scope="col">Група або тренери</th><th scope="col">Дні та час</th></tr></thead>
      <tbody>{entries.map((entry) => <tr key={entry.id}>
        <th scope="row">№ {entry.school_number}</th>
        <td>
          {entry.group_name && <div>{entry.group_name}</div>}
          {entry.coach_names.join(" та ")}
        </td>
        <td>{weekLabels(entry.weekly_slots).map((line) => <div key={line}>{line}</div>)}</td>
      </tr>)}</tbody>
    </table>
  </section>;
}
