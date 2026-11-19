"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { VenueBookingSelector } from "@/components/common/venue-booking-selector";
import { LoadingState, Modal, StatusMessage } from "@/components/common/workspace-ui";
import { OFFLINE_MESSAGE, useAutomaticRefresh } from "@/lib/browser/use-automatic-refresh";
import {
  WEEKDAYS, groupScheduleByDay, sameScheduleSlot, scheduleCoachLabel, scheduleConflicts,
  scheduleVenuePartLabel, slotTime, slotTimeRange, slotVenueLabel,
  type ScheduleSlot, type ScheduleSlotValues,
} from "@/lib/domain/club-weekly-schedule";
import { groupCode } from "@/lib/domain/seasons";
import type { GroupSummary, Venue } from "@/lib/domain/types";
import { effectiveVenuePart, isAwayVenue, VENUE_SELECT } from "@/lib/domain/venue-booking";
import styles from "./club-weekly-schedule.module.css";

type ScheduleProps = { client: SupabaseClient } & (
  { mode: "admin"; groups: GroupSummary[] } | { mode: "coach"; coachId: string }
);
type ScheduleEditor = { kind: "new"; id: string; weekday: number } | { kind: "edit" | "copy"; id: string; source: ScheduleSlot };
type ScheduleFilters = { group: string; coach: string; venue: string };
type SelectOption = { id: string; label: string };
type CoachOption = { id: string; full_name: string };

const SLOT_TABLE = "club_schedule_slots";
const SLOT_FIELDS = "weekday, start_time, end_time, group_id, coach_id, venue_id, venue_part, updated_at";
const EDITOR_TITLES = { new: "Додати заняття", edit: "Редагувати заняття", copy: "Скопіювати заняття" };
const DAY_OPTIONS = WEEKDAYS.map((label, index) => ({ id: String(index + 1), label }));
const ignoreCalendarAvailability = () => undefined;

async function listSchedule(client: SupabaseClient) {
  const { data, error } = await client.rpc("list_club_weekly_schedule");
  if (error || !Array.isArray(data)) throw new Error("Не вдалося завантажити розклад.");
  return data as ScheduleSlot[];
}

function filterOptions(rows: ScheduleSlot[], option: (row: ScheduleSlot) => [string | null, string | null]): SelectOption[] {
  const choices = new Map<string, string>();
  for (const row of rows) {
    const [id, label] = option(row);
    if (id && label) choices.set(id, label);
  }
  return Array.from(choices, ([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "uk", { numeric: true }));
}

function ScheduleFilter({ label, all, value, options, onChange }: {
  label: string; all: string; value: string; options: SelectOption[]; onChange: (value: string) => void;
}) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">{all}</option>
    {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select></label>;
}

export function ClubWeeklySchedule(props: ScheduleProps) {
  const { client, mode } = props;
  const [slots, setSlots] = useState<ScheduleSlot[] | null>(null);
  const [filters, setFilters] = useState<ScheduleFilters>({ group: "", coach: "", venue: "" });
  const [day, setDay] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [editor, setEditor] = useState<ScheduleEditor | null>(null);
  const [remove, setRemove] = useState<ScheduleSlot | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState("");
  const loadSequence = useRef(0);

  const refresh = useCallback(async () => {
    const sequence = ++loadSequence.current;
    try {
      const updated = await listSchedule(client);
      if (sequence === loadSequence.current) {
        setSlots(updated);
        setLoadError(false);
      }
      return updated;
    } catch {
      if (sequence === loadSequence.current) setLoadError(true);
      return null;
    }
  }, [client]);
  const refreshInBackground = useCallback(async () => { await refresh(); }, [refresh]);
  const online = useAutomaticRefresh(refreshInBackground);
  useEffect(() => { void refresh(); }, [refresh]);

  const rows = slots ?? [];
  const groups = filterOptions(rows, (row) => [row.group_id, row.group_code]);
  const coaches = filterOptions(rows, (row) => [row.coach_id, row.coach_name]);
  const venues = filterOptions(rows, (row) => [row.booking_venue_id, row.booking_venue_name]);
  const groupFilter = groups.some((item) => item.id === filters.group) ? filters.group : "";
  const coachFilter = coaches.some((item) => item.id === filters.coach) ? filters.coach : "";
  const venueFilter = venues.some((item) => item.id === filters.venue) ? filters.venue : "";
  const visible = rows.filter((row) => props.mode === "coach"
    ? !onlyMine || row.coach_id === props.coachId
    : (!groupFilter || row.group_id === groupFilter) && (!coachFilter || row.coach_id === coachFilter)
      && (!venueFilter || row.booking_venue_id === venueFilter));
  const days = groupScheduleByDay(visible, day ? Number(day) : undefined);

  function updated(message: string) {
    setEditor(null);
    setRemove(null);
    setNotice(message);
    void refresh();
  }

  return <div className="workspace-stack">
    <section className={`filter-bar ${styles.filters}`} aria-label="Фільтри розкладу">
      <div className={styles.filterFields}>
        <ScheduleFilter label="День" all="Увесь тиждень" value={day} options={DAY_OPTIONS} onChange={setDay} />
        {mode === "admin" ? <>
          <ScheduleFilter label="Група" all="Усі групи" value={groupFilter} options={groups} onChange={(group) => setFilters((current) => ({ ...current, group }))} />
          <ScheduleFilter label="Тренер" all="Усі тренери" value={coachFilter} options={coaches} onChange={(coach) => setFilters((current) => ({ ...current, coach }))} />
          <ScheduleFilter label="Поле" all="Усі поля" value={venueFilter} options={venues} onChange={(venue) => setFilters((current) => ({ ...current, venue }))} />
        </> : <label className={styles.onlyMine}><input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />Лише мої заняття</label>}
      </div>
      {mode === "admin" && <button type="button" className="primary-action" disabled={!online || slots === null}
        onClick={() => setEditor({ kind: "new", id: crypto.randomUUID(), weekday: Number(day) || 1 })}>
        <Plus size={18} aria-hidden="true" />Додати заняття
      </button>}
    </section>
    {!online && <p className="muted" role="status">{OFFLINE_MESSAGE}</p>}
    {loadError && online && <div>
      <StatusMessage kind="error">Не вдалося оновити розклад.</StatusMessage>
      <button type="button" className="secondary-action" onClick={() => void refresh()}>Оновити</button>
    </div>}
    {notice && <StatusMessage kind="success">{notice}</StatusMessage>}
    {slots === null && online && !loadError && <LoadingState label="Завантажуємо розклад…" />}
    {slots !== null && <div className={styles.week}>
      {days.map(({ weekday, label, venues }) => <section className={styles.day} key={weekday} aria-label={label}>
        <h2 className={styles.dayTitle}>{label}</h2>
        {venues.length ? <div className={`responsive-table ${styles.schedule}`}>
          <table className={styles.table} aria-label={`Розклад занять · ${label}`} role="table">
            <thead role="rowgroup"><tr role="row">
              <th scope="col" role="columnheader">Майданчик</th>
              <th scope="col" role="columnheader">Час</th>
              <th scope="col" role="columnheader">Частина майданчика</th>
              <th scope="col" role="columnheader">Група</th>
              <th scope="col" role="columnheader">Тренер</th>
              {mode === "admin" && <th scope="col" role="columnheader">Дії</th>}
            </tr></thead>
            {venues.map((venue) => <tbody role="rowgroup" key={venue.id ?? "unassigned"}>
              {venue.slots.map((slot, index) => <tr role="row" key={slot.id}>
                {index === 0 && <th scope="rowgroup" role="rowheader" rowSpan={venue.slots.length} className={styles.venue}>{venue.name}</th>}
                <td role="cell" data-label="Час" className={styles.time}>{slotTimeRange(slot)}</td>
                <td role="cell" data-label="Частина майданчика">{scheduleVenuePartLabel(slot)}</td>
                <td role="cell" data-label="Група"><strong>{slot.group_code}</strong></td>
                <td role="cell" data-label="Тренер" title={slot.coach_name ?? undefined}>{scheduleCoachLabel(slot.coach_name)}</td>
                {mode === "admin" && <td role="cell" className={styles.rowActions}>
                  <div className={styles.actions}>
                    <button type="button" className="secondary-action small" disabled={!online} onClick={() => setEditor({ kind: "edit", id: slot.id, source: slot })}><Pencil size={15} aria-hidden="true" />Редагувати</button>
                    <button type="button" className="secondary-action small" disabled={!online} onClick={() => setEditor({ kind: "copy", id: crypto.randomUUID(), source: slot })}><Copy size={15} aria-hidden="true" />Скопіювати</button>
                    <button type="button" className="danger-action small" disabled={!online} onClick={() => setRemove(slot)}><Trash2 size={15} aria-hidden="true" />Прибрати</button>
                  </div>
                </td>}
              </tr>)}
            </tbody>)}
          </table>
        </div> : <p className="muted">Занять немає.</p>}
      </section>)}
    </div>}
    {props.mode === "admin" && editor && <ScheduleSlotEditor key={editor.id} client={client} groups={props.groups} editor={editor} slots={rows} refresh={refresh} onClose={() => setEditor(null)} onSaved={() => updated("Заняття збережено в розкладі.")} />}
    {mode === "admin" && remove && <RemoveScheduleSlot client={client} slot={remove} onClose={() => setRemove(null)} onRemoved={() => updated("Заняття прибрано з розкладу.")} />}
  </div>;
}

function ScheduleSlotEditor({ client, groups, editor, slots, refresh, onClose, onSaved }: {
  client: SupabaseClient;
  groups: GroupSummary[];
  editor: ScheduleEditor;
  slots: ScheduleSlot[];
  refresh: () => Promise<ScheduleSlot[] | null>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const source = editor.kind === "new" ? null : editor.source;
  const formId = useId();
  const [values, setValues] = useState<ScheduleSlotValues>(() => ({
    weekday: editor.kind === "new" ? editor.weekday : editor.source.weekday,
    start_time: source ? slotTime(source.start_time) : "17:00",
    end_time: source ? slotTime(source.end_time) : "18:00",
    group_id: source?.group_id ?? "",
    coach_id: source?.coach_id ?? null,
    venue_id: source?.venue_id ?? null,
    venue_part: source?.venue_part ?? "whole",
  }));
  const [options, setOptions] = useState<{ coaches: CoachOption[]; venues: Venue[] } | null>(null);
  const [optionsError, setOptionsError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const venue = options?.venues.find((item) => item.id === values.venue_id);
  const payload = { ...values, venue_part: effectiveVenuePart(venue, values.venue_part) };
  const candidate = { ...payload, booking_venue_id: isAwayVenue(venue) ? null : venue?.parent_venue_id ?? venue?.id ?? null };
  const editingId = editor.kind === "edit" ? editor.id : undefined;
  const conflicts = scheduleConflicts(candidate, slots, editingId);

  useEffect(() => {
    let active = true;
    void Promise.all([
      client.from("profiles").select("id, full_name").eq("role", "coach").eq("status", "active").order("full_name"),
      client.from("venues").select(VENUE_SELECT).order("name"),
    ]).then(([coaches, venues]) => {
      if (!active) return;
      if (coaches.error || venues.error) setOptionsError(true);
      else setOptions({ coaches: coaches.data ?? [], venues: (venues.data ?? []) as Venue[] });
    }).catch(() => { if (active) setOptionsError(true); });
    return () => { active = false; };
  }, [client, retry]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !options) return;
    if (!values.group_id || !values.start_time || !values.end_time || values.start_time >= values.end_time) {
      setError("Виберіть групу й укажіть час завершення пізніше за час початку.");
      return;
    }
    setError("");
    busyRef.current = true;
    setBusy(true);
    try {
      const latest = await refresh();
      if (!latest) {
        setError("Не вдалося перевірити розклад. Спробуйте ще раз.");
        return;
      }
      const currentConflicts = scheduleConflicts(candidate, latest, editingId);
      const shownConflicts = new Map(conflicts.map(({ slot, reasons }) => [slot.id, reasons.join(",")]));
      if (currentConflicts.some(({ slot, reasons }) => shownConflicts.get(slot.id) !== reasons.join(","))) {
        setError("Розклад оновився. Перегляньте попередження й натисніть «Зберегти» ще раз.");
        return;
      }
      if (editor.kind === "edit") {
        const current = await client.from(SLOT_TABLE).select(SLOT_FIELDS).eq("id", editor.id).maybeSingle();
        if (current.error) throw current.error;
        const row = current.data;
        const currentVenue = options.venues.find((item) => item.id === row?.venue_id);
        const currentValues = row && { ...row, venue_part: effectiveVenuePart(currentVenue, row.venue_part) };
        if (currentValues && sameScheduleSlot(currentValues, payload)) {
          onSaved();
          return;
        }
        if (!currentValues || !sameScheduleSlot(currentValues, editor.source)) {
          setError("Це заняття вже змінили. Відкрийте актуальний запис із розкладу.");
          return;
        }
        const result = await client.from(SLOT_TABLE).update(payload).eq("id", editor.id).eq("updated_at", currentValues.updated_at).select("id").maybeSingle();
        if (result.error) throw result.error;
        if (!result.data) {
          setError("Це заняття вже змінили. Відкрийте актуальний запис із розкладу.");
          return;
        }
      } else {
        const result = await client.from(SLOT_TABLE).insert({ id: editor.id, ...payload }).select("id").single();
        if (result.error?.code === "23505") {
          const saved = await client.from(SLOT_TABLE).select(SLOT_FIELDS).eq("id", editor.id).maybeSingle();
          if (saved.error || !saved.data || !sameScheduleSlot(saved.data, payload)) throw result.error;
        } else if (result.error) throw result.error;
      }
      onSaved();
    } catch {
      setError("Не вдалося зберегти заняття. Спробуйте ще раз.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const close = () => { if (!busyRef.current) onClose(); };
  return <Modal title={EDITOR_TITLES[editor.kind]} onClose={close} footer={<div className={styles.actions}>
    <button type="button" className="secondary-action" disabled={busy} onClick={close}>Скасувати</button>
    <button type="submit" className="primary-action" form={formId} disabled={busy || !options}>{busy ? "Зберігаємо…" : "Зберегти"}</button>
  </div>}>
    {optionsError && <div><StatusMessage kind="error">Не вдалося завантажити тренерів і майданчики.</StatusMessage><button type="button" className="secondary-action" onClick={() => { setOptionsError(false); setRetry((current) => current + 1); }}>Повторити</button></div>}
    {!options && !optionsError && <LoadingState />}
    {options && <form id={formId} className="form-grid" onSubmit={(event) => void save(event)}>
      <label><span>День тижня</span><select value={values.weekday} onChange={(event) => setValues({ ...values, weekday: Number(event.target.value) })}>{WEEKDAYS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
      <label><span>Група</span><select required value={values.group_id} onChange={(event) => setValues({ ...values, group_id: event.target.value })}>
        <option value="">Виберіть групу</option>
        {source && !groups.some((group) => group.id === source.group_id) && <option value={source.group_id}>{source.group_code}</option>}
        {groups.map((group) => <option key={group.id} value={group.id}>{groupCode(group)}</option>)}
      </select></label>
      <label><span>Початок</span><input type="time" required value={values.start_time} onChange={(event) => setValues({ ...values, start_time: event.target.value })} /></label>
      <label><span>Завершення</span><input type="time" required value={values.end_time} onChange={(event) => setValues({ ...values, end_time: event.target.value })} /></label>
      <label className="span-2"><span>Тренер</span><select value={values.coach_id ?? ""} onChange={(event) => setValues({ ...values, coach_id: event.target.value || null })}>
        <option value="">Не вказано</option>
        {source?.coach_id && !options.coaches.some((coach) => coach.id === source.coach_id) && <option value={source.coach_id}>{source.coach_name}</option>}
        {options.coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.full_name}</option>)}
      </select></label>
      <VenueBookingSelector client={client} venues={options.venues} venueId={values.venue_id ?? ""} part={values.venue_part} startAt={null} minutes={null} checkAvailability={false}
        onVenueChange={(id) => setValues((current) => ({ ...current, venue_id: id || null, venue_part: effectiveVenuePart(options.venues.find((item) => item.id === id), current.venue_part) }))}
        onPartChange={(venue_part) => setValues((current) => ({ ...current, venue_part }))} onBlockedChange={ignoreCalendarAvailability} />
      {conflicts.length > 0 && <div className="span-2" role="status">
        <strong>Накладки в розкладі</strong>
        <ul className={styles.warnings}>{conflicts.map(({ slot, reasons }) => <li key={slot.id}>
          {WEEKDAYS[slot.weekday - 1]}, {slotTimeRange(slot)} · {slot.group_code} · {slot.coach_name ?? "тренера не вказано"} · {slotVenueLabel(slot)}. Збіг у розкладі — {reasons.join(", ")}.
        </li>)}</ul>
      </div>}
      {error && <div className="span-2"><StatusMessage kind="error">{error}</StatusMessage></div>}
    </form>}
  </Modal>;
}

function RemoveScheduleSlot({ client, slot, onClose, onRemoved }: {
  client: SupabaseClient; slot: ScheduleSlot; onClose: () => void; onRemoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const busyRef = useRef(false);

  async function remove() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await client.from(SLOT_TABLE).delete().eq("id", slot.id).select("id").maybeSingle();
      if (result.error) throw result.error;
      if (!result.data && (await listSchedule(client)).some((row) => row.id === slot.id)) {
        setError(true);
        return;
      }
      onRemoved();
    } catch {
      setError(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const close = () => { if (!busyRef.current) onClose(); };
  return <Modal title="Прибрати заняття з розкладу?" onClose={close} footer={<div className={styles.actions}>
    <button type="button" className="secondary-action" disabled={busy} onClick={close}>Скасувати</button>
    <button type="button" className="danger-action" disabled={busy} onClick={() => void remove()}>{busy ? "Прибираємо…" : "Прибрати"}</button>
  </div>}>
    <p>{WEEKDAYS[slot.weekday - 1]}, {slotTimeRange(slot)} · {slot.group_code} · {slotVenueLabel(slot)}</p>
    {error && <StatusMessage kind="error">Не вдалося прибрати заняття. Спробуйте ще раз.</StatusMessage>}
  </Modal>;
}
