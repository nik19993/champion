"use client";
import { AdminCalendar } from "@/components/admin/admin-calendar";
import { AdminLocationSchedule } from "@/components/admin/admin-location-schedule";
import { ClubWeeklySchedule } from "@/components/common/club-weekly-schedule";
import { VenueBookingSelector } from "@/components/common/venue-booking-selector";
import { venueConflictMessage } from "@/lib/supabase/venue-conflict-message";
import { effectiveVenuePart, isAwayVenue, normalizeVenuePart, VENUE_SELECT, type VenuePart } from "@/lib/domain/venue-booking";

import { groupCode } from "@/lib/domain/seasons";
import { durationInput, durationMinutes } from "@/lib/domain/event-duration";
import { firstRelation, operationalReportRow, OPERATIONAL_REPORT_SELECT } from "@/lib/domain/operational-report";
import { operationalItemIsVisible } from "@/lib/domain/event-visibility";
import { useAutomaticRefresh } from "@/lib/browser/use-automatic-refresh";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarClock, CalendarRange, CheckCircle2, CircleDashed, TriangleAlert } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, LoadingState, Modal, Pill, StatusMessage, Tabs, WorkspaceHeader } from "@/components/common/workspace-ui";
import { combineKyivDateTime, EVENT_LABELS, formatDateTime, OPERATIONAL_STATUS_LABELS, OPERATIONAL_TYPE_LABELS, safeError, toKyivDateInput, toKyivTimeInput } from "@/lib/domain/format";
import type { EventItem, GroupSummary, OperationalItem, OperationalStatus, Profile, Venue } from "@/lib/domain/types";

type RangeMode = "7" | "10" | "30" | "month" | "custom";
type PlanTab = "attention" | "calendar" | "schedule" | "locations";
const PLAN_TABS: Array<{ value: PlanTab; label: string }> = [
  { value: "attention", label: "Потребують уваги" },
  { value: "calendar", label: "Календар" },
  { value: "schedule", label: "Розклад занять" },
  { value: "locations", label: "Розклад локацій" },
];

type Related<T> = T | T[] | null;
type CoachContact = Pick<Profile, "full_name" | "last_name" | "role" | "status">;
type AttentionItem = Omit<OperationalItem, "groups" | "events" | "creator"> & {
  groups: Related<Pick<GroupSummary, "code" | "display_code" | "cohort_birth_year" | "season"> & {
    coach_group_assignments: Array<{
      is_active: boolean;
      valid_from: string | null;
      valid_to: string | null;
      coach: Related<CoachContact>;
    }>;
  }>;
  events: Related<Pick<EventItem, "start_at" | "event_type" | "status" | "coach_comment"> & {
    coach: Related<CoachContact>;
    substitute: Related<CoachContact>;
  }>;
  assigned: Related<CoachContact>;
  creator: Related<CoachContact>;
};

const COACH_CONTACT_FIELDS = "full_name, last_name, role, status";
const ATTENTION_SELECT = `
  id, group_id, event_id, item_type, status, title, comment, due_at, created_at,
  assigned:profiles!operational_items_assigned_to_fkey(${COACH_CONTACT_FIELDS}),
  creator:profiles!operational_items_created_by_fkey(${COACH_CONTACT_FIELDS}),
  groups(code, display_code, cohort_birth_year, season,
    coach_group_assignments!coach_group_assignments_group_id_fkey(
      is_active, valid_from, valid_to, coach:profiles!coach_group_assignments_coach_id_fkey(${COACH_CONTACT_FIELDS})
    )
  ),
  events(start_at, event_type, status, coach_comment,
    coach:profiles!events_coach_id_fkey(${COACH_CONTACT_FIELDS}),
    substitute:profiles!events_substitute_coach_id_fkey(${COACH_CONTACT_FIELDS})
  )
`;

function contactName(contact: Related<CoachContact> | undefined) {
  const profile = firstRelation(contact);
  return profile?.role === "coach" && profile.status === "active"
    ? profile.last_name?.trim() || profile.full_name.trim()
    : "";
}

function attentionCoachLabel(item: AttentionItem, today: string) {
  const event = firstRelation(item.events);
  const individual = [item.assigned, event?.substitute, event?.coach, item.creator].map(contactName).find(Boolean);
  if (individual) return individual;

  const assignments = firstRelation(item.groups)?.coach_group_assignments ?? [];
  const coaches = assignments.filter((row) =>
    row.is_active && (!row.valid_from || row.valid_from <= today) && (!row.valid_to || today <= row.valid_to)
  ).map((row) => contactName(row.coach)).filter(Boolean);
  return [...new Set(coaches)].sort((left, right) => left.localeCompare(right, "uk")).join(", ") || "Тренера не вказано";
}

function rangeFor(mode: RangeMode, customStart: string, customEnd: string) {
  const start = mode === "custom" && customStart ? new Date(`${customStart}T00:00:00`) : new Date();
  const end = mode === "custom" && customEnd ? new Date(`${customEnd}T23:59:59`) : new Date(start);
  if (mode === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (mode !== "custom") {
    end.setDate(start.getDate() + Number(mode) - 1);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

export function AdminPlan({ client, groups }: { client: SupabaseClient; groups: GroupSummary[] }) {
  const [tab, setTab] = useState<PlanTab>("attention");
  const [eventId, setEventId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  return (
    <div className="workspace-stack">
      <WorkspaceHeader eyebrow="Операційне керування" title="План адміністратора" description="Ситуації, які потребують рішення, та розклад подій клубу." />
      <Tabs items={PLAN_TABS} value={tab} onChange={setTab} label="Розділи плану адміністратора" />
      {tab === "attention" && <AdminAttentionPlan client={client} />}
      {tab === "calendar" && (
        <AdminCalendar client={client} groups={groups} revision={revision} onOpenEvent={setEventId} />
      )}
      {tab === "schedule" && <ClubWeeklySchedule mode="admin" client={client} groups={groups} />}
      {tab === "locations" && <AdminLocationSchedule client={client} />}
      {eventId && <AdminEventModal client={client} eventId={eventId} onClose={() => setEventId(null)} onSaved={() => {
        setEventId(null);
        setRevision((current) => current + 1);
      }} />}
    </div>
  );
}

function AdminAttentionPlan({ client }: { client: SupabaseClient }) {
  const [mode, setMode] = useState<RangeMode>("7");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [openedEventId, setOpenedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const attentionRequest = useRef(0);
  const range = useMemo(() => rangeFor(mode, customStart, customEnd), [customEnd, customStart, mode]);
  const today = toKyivDateInput(new Date());

  const load = useCallback(async (silent = false) => {
    const ticket = ++attentionRequest.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await client.from("operational_items").select(ATTENTION_SELECT).neq("item_type", "conflict").neq("item_type", "reschedule").order("status").order("created_at", { ascending: false }).limit(1000);
      if (ticket !== attentionRequest.current) return;
      if (result.error) throw result.error;
      const start = range.start.getTime();
      const end = range.end.getTime();
      setItems(((result.data ?? []) as unknown as AttentionItem[]).filter((item) => {
        if (!operationalItemIsVisible(item)) return false;
        const relevantAt = item.due_at ?? firstRelation(item.events)?.start_at ?? item.created_at;
        const timestamp = new Date(relevantAt).getTime();
        return timestamp >= start && timestamp <= end;
      }));
    } catch {
      if (ticket === attentionRequest.current) setError("Не вдалося завантажити операційний план.");
    } finally {
      if (ticket === attentionRequest.current) setLoading(false);
    }
  }, [client, range.end, range.start]);

  const refreshAttention = useCallback(() => load(true), [load]);
  useAutomaticRefresh(refreshAttention);
  useEffect(() => {
    void load();
    const requests = attentionRequest;
    return () => { requests.current++; };
  }, [load]);

  async function updateStatus(id: string, status: OperationalStatus) {
    const result = await client.from("operational_items").update({ status }).eq("id", id);
    if (result.error) { setError("Статус не збережено."); return; }
    setItems((rows) => rows.map((item) => item.id === id ? { ...item, status } : item));
  }

  return <div className="workspace-stack">
    <section className="filter-bar">
      <label><span>Період</span><select value={mode} onChange={(event) => setMode(event.target.value as RangeMode)}><option value="7">7 днів</option><option value="10">10 днів</option><option value="30">30 днів</option><option value="month">Поточний місяць</option><option value="custom">Власний діапазон</option></select></label>
      {mode === "custom" && <><label><span>Від</span><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label><span>До</span><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></>}
      <Pill tone="plum"><CalendarRange size={15} />{items.length} ситуацій</Pill>
    </section>
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
    {loading ? <LoadingState /> : items.length ? <div className="operational-list">{items.map((item) => <article key={item.id} className={item.item_type === "coach_substitution" ? "substitution" : ""}>
      <div className="operational-icon">{item.item_type === "coach_substitution" || item.item_type === "conflict" ? <TriangleAlert /> : item.status === "done" ? <CheckCircle2 /> : <CircleDashed />}</div>
      <div className="operational-copy">
        <div style={{ flexWrap: "wrap" }}>
          <Pill tone={item.item_type === "coach_substitution" ? "danger" : "warning"}>{OPERATIONAL_TYPE_LABELS[item.item_type]}</Pill>
          <Pill tone="plum">{groupCode(item.groups)}</Pill>
          <Pill>{attentionCoachLabel(item, today)}</Pill>
        </div>
        <h2>{item.title}</h2>
        {item.comment && <p>{item.comment}</p>}
        <small>{formatDateTime(firstRelation(item.events)?.start_at ?? item.created_at)}</small>
      </div>
      <div className="operational-actions">{item.event_id && <button type="button" className="secondary-action" onClick={() => setOpenedEventId(item.event_id ?? null)}><CalendarClock size={17} />Відкрити подію</button>}<label className="status-select"><span>Стан</span><select value={item.status} onChange={(event) => void updateStatus(item.id, event.target.value as OperationalStatus)}>{Object.entries(OPERATIONAL_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
    </article>)}</div> : <EmptyState title="За вибраний період ситуацій немає" />}
    {openedEventId && <AdminEventModal client={client} eventId={openedEventId} onClose={() => setOpenedEventId(null)} onSaved={() => { setOpenedEventId(null); void load(); }} />}
  </div>;
}

export function AdminEventModal({ client, eventId, onClose, onSaved }: { client: SupabaseClient; eventId: string; onClose: () => void; onSaved: () => void }) {
  const [event, setEvent] = useState<EventItem | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [coaches, setCoaches] = useState<Profile[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("75");
  const [venueId, setVenueId] = useState("");
  const [venuePart, setVenuePart] = useState<VenuePart>("whole");
  const [venueBlocked, setVenueBlocked] = useState(false);
  const [coachId, setCoachId] = useState("");
  const [previousCoachUnavailable, setPreviousCoachUnavailable] = useState(false);
  const [substituteId, setSubstituteId] = useState("");
  const [needsSubstitute, setNeedsSubstitute] = useState(false);
  const [status, setStatus] = useState<EventItem["status"]>("scheduled");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      client.from("events").select("id, group_id, event_type, start_at, duration_minutes, venue_id, venue_part, task_id, coach_id, substitute_coach_id, title, notes, organizational_need, coach_comment, needs_substitute, original_start_at, is_rescheduled, status, groups(code, display_code, cohort_birth_year, season, age), venues(name, parent_venue_id), methodology_tasks(title)").eq("id", eventId).single(),
      client.from("venues").select(VENUE_SELECT).order("name"),
      client.from("profiles").select("id, full_name, first_name, last_name, middle_name, email, role, status").eq("role", "coach").eq("status", "active").order("full_name"),
    ]).then(([eventResult, venueResult, coachResult]) => {
      if (!active) return;
      if (eventResult.error) { setMessage("Подію не знайдено або доступ заборонено."); setLoading(false); return; }
      const row = eventResult.data as unknown as EventItem;
      setEvent(row);
      setDate(toKyivDateInput(row.start_at));
      setTime(toKyivTimeInput(row.start_at));
      setDuration(durationInput(row.duration_minutes));
      setVenueId(row.venue_id ?? "");
      setVenuePart(normalizeVenuePart(row.venue_part));
      const activeCoaches = (coachResult.data ?? []) as Profile[];
      const currentCoachAvailable = activeCoaches.some((coach) => coach.id === row.coach_id);
      setCoachId(currentCoachAvailable ? row.coach_id : "");
      setPreviousCoachUnavailable(!currentCoachAvailable);
      setSubstituteId(row.substitute_coach_id ?? "");
      setNeedsSubstitute((row.needs_substitute ?? false) || !currentCoachAvailable);
      setStatus(row.status);
      setVenues((venueResult.data ?? []) as Venue[]);
      setCoaches(activeCoaches);
      setLoading(false);
    });
    return () => { active = false; };
  }, [client, eventId]);

  async function save(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!event || busy) return;
    const venue = venues.find((item) => item.id === venueId);
    const away = isAwayVenue(venue);
    const part = effectiveVenuePart(venue, venuePart);
    if (status === "scheduled" && venueBlocked && !away) { setMessage(await venueConflictMessage(client, venueId, combineKyivDateTime(date, time), durationMinutes(duration) ?? 60, part, event.id, "Конфлікт: обрана частина майданчика зайнята. Виберіть іншу частину або час.")); return; }
    const minutes = durationMinutes(duration);
    if (minutes == null) { setMessage("Вкажіть цілу тривалість від 15 до 360 хвилин."); return; }
    setBusy(true);
    setMessage(null);
    const nextStart = combineKyivDateTime(date, time);
    const moved = new Date(nextStart).getTime() !== new Date(event.start_at).getTime();
    const stillNeedsSubstitute = needsSubstitute && !substituteId;
    const userResult = await client.auth.getUser();
    const actorId = userResult.data.user?.id ?? null;
    if (!actorId) { setBusy(false); setMessage("Сесію адміністратора не підтверджено."); return; }
    const result = await client.from("events").update({ start_at: nextStart, duration_minutes: minutes, venue_id: venueId || null, venue_part: part, coach_id: coachId, substitute_coach_id: substituteId || null, needs_substitute: stillNeedsSubstitute, status, original_start_at: moved ? event.original_start_at ?? event.start_at : event.original_start_at ?? null, is_rescheduled: moved || event.is_rescheduled || false, updated_by: actorId }).eq("id", event.id).select("id").single();
    if (result.error) {
      const fallback = safeError(result.error, "Подію не збережено.");
      setMessage(!away && result.error.code === "23P01" ? await venueConflictMessage(client, venueId, nextStart, minutes, part, event.id, fallback) : fallback);
      setBusy(false); return;
    }
    await client.from("operational_items").update({ due_at: nextStart }).eq("event_id", event.id).neq("status", "done");
    if (stillNeedsSubstitute) {
      await client.from("operational_items").upsert({ group_id: event.group_id, event_id: event.id, item_type: "coach_substitution", status: "todo", title: "Потрібна заміна тренера", due_at: nextStart, created_by: actorId, dedupe_key: `${event.id}:coach_substitution` }, { onConflict: "dedupe_key" });
    } else {
      await client.from("operational_items").update({ status: "done", updated_by: actorId }).eq("event_id", event.id).eq("item_type", "coach_substitution").neq("status", "done");
    }
    setBusy(false);
    onSaved();
  }

  const footer = <><button type="button" className="secondary-action" onClick={onClose}>Скасувати</button><button form="admin-event-form" className="primary-action" disabled={busy || loading || !coachId}>{busy ? "Збереження…" : "Зберегти зміни"}</button></>;
  return <Modal title={event ? `${EVENT_LABELS[event.event_type]} · ${groupCode(event.groups)}` : "Подія"} onClose={onClose} wide footer={footer}>{loading ? <LoadingState /> : event ? <form id="admin-event-form" className="form-grid" onSubmit={save}><label><span>Дата</span><input type="date" value={date} onChange={(value) => setDate(value.target.value)} required /></label><label><span>Час (Київ)</span><input type="time" value={time} onChange={(value) => setTime(value.target.value)} required /></label><label><span>Тривалість, хв</span><input type="text" inputMode="numeric" pattern="[0-9]+" value={duration} onChange={(value) => { if (/^\d*$/.test(value.target.value)) setDuration(durationInput(value.target.value)); }} aria-label="Тривалість у хвилинах" required /></label><label><span>Стан</span><select value={status} onChange={(value) => setStatus(value.target.value as EventItem["status"])}><option value="scheduled">Заплановано</option><option value="completed">Завершено</option><option value="cancelled">Скасовано</option></select></label><VenueBookingSelector client={client} venues={venues} venueId={venueId} part={venuePart} startAt={date && time ? combineKyivDateTime(date, time) : null} minutes={durationMinutes(duration)} excludeEventId={event.id} checkAvailability={status === "scheduled"} onVenueChange={(id) => { setVenueId(id); setVenuePart("whole"); }} onPartChange={setVenuePart} onBlockedChange={setVenueBlocked} /><label className="span-2"><span>Основний тренер</span><select value={coachId} onChange={(value) => { setCoachId(value.target.value); setPreviousCoachUnavailable(false); setNeedsSubstitute(false); setSubstituteId(""); }} required><option value="" disabled>{previousCoachUnavailable ? "Попереднього тренера видалено — оберіть нового" : "Оберіть тренера"}</option>{coaches.map((coach) => <option value={coach.id} key={coach.id}>{coach.full_name}</option>)}</select></label><label className="span-2"><span>Тренер на заміну</span><select value={substituteId} onChange={(value) => setSubstituteId(value.target.value)}><option value="">Не призначено</option>{coaches.filter((coach) => coach.id !== coachId).map((coach) => <option value={coach.id} key={coach.id}>{coach.full_name}</option>)}</select></label><label className="check-field span-2"><input type="checkbox" checked={needsSubstitute} onChange={(value) => setNeedsSubstitute(value.target.checked)} /><span>Потрібно знайти заміну</span></label>{event.is_rescheduled && event.original_start_at && Date.parse(event.original_start_at) !== Date.parse(event.start_at) && <div className="span-2 text-block"><h3>Попередній час</h3><p>{formatDateTime(event.original_start_at)} · за Києвом</p></div>}{event.methodology_tasks?.title && <div className="span-2 text-block"><h3>Навчальне завдання</h3><p>{event.methodology_tasks.title}</p></div>}{event.organizational_need && <div className="span-2 text-block"><h3>Організаційні потреби</h3><p>{event.organizational_need}</p></div>}{event.coach_comment && <div className="span-2 text-block"><h3>Коментар тренера</h3><p>{event.coach_comment}</p></div>}{message && <div className="span-2"><StatusMessage kind="error">{message}</StatusMessage></div>}</form> : <StatusMessage kind="error">{message ?? "Подію не завантажено."}</StatusMessage>}</Modal>;
}

export function AdminReport({ client }: { client: SupabaseClient }) {
  const [items, setItems] = useState<OperationalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reportRequest = useRef(0);
  const load = useCallback(async (silent = false) => {
    const ticket = ++reportRequest.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const result = await client.from("operational_items").select(OPERATIONAL_REPORT_SELECT)
        .neq("item_type", "conflict").neq("item_type", "reschedule")
        .gte("created_at", start.toISOString()).order("created_at", { ascending: false });
      if (ticket !== reportRequest.current) return;
      if (result.error) throw result.error;
      setItems(((result.data ?? []) as unknown as OperationalItem[]).filter(operationalItemIsVisible));
    } catch {
      if (ticket === reportRequest.current) setError("Не вдалося завантажити загальний звіт. Перевірте з’єднання.");
    } finally {
      if (ticket === reportRequest.current) setLoading(false);
    }
  }, [client]);
  const refreshReport = useCallback(() => load(true), [load]);
  useAutomaticRefresh(refreshReport);
  useEffect(() => {
    void load();
    const requests = reportRequest;
    return () => { requests.current++; };
  }, [load]);
  const counts = { todo: items.filter((item) => item.status === "todo").length, in_progress: items.filter((item) => item.status === "in_progress").length, done: items.filter((item) => item.status === "done").length };
  const completion = items.length ? Math.round((counts.done / items.length) * 100) : 0;
  const substitutions = items.filter((item) => item.item_type === "coach_substitution").length;
  return <div className="workspace-stack">
    <WorkspaceHeader eyebrow="Ситуації та дії адміністратора" title="Загальний звіт" description="Записи за останні 30 днів. Для події показано дату її проведення; зміни вносяться тільки у Плані." />
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
    {loading ? <LoadingState /> : !error && <>
      <section className="metric-grid"><article><small>Потрібно зробити</small><b>{counts.todo}</b></article><article><small>В процесі</small><b>{counts.in_progress}</b></article><article><small>Виконано</small><b>{counts.done}</b></article><article><small>Виконання</small><b>{completion}%</b></article><article><small>Заміни тренера</small><b>{substitutions}</b></article></section>
      {items.length ? <div className="responsive-table"><table className="operational-report-table">
        <thead><tr><th>Дата</th><th>Вікова група</th><th>Тренер</th><th>Що потрібно зробити / коментар</th><th>Подія / ситуація</th><th>Стан</th></tr></thead>
        <tbody>{items.map((item) => { const row = operationalReportRow(item); return <tr key={item.id}>
          <td>{row.date}</td><td>{row.group}</td><td>{row.coach}</td><td className="report-action-cell">{row.action}</td><td className="report-event-cell">{row.context}</td>
          <td><Pill tone={item.status === "done" ? "success" : item.status === "in_progress" ? "warning" : "neutral"}>{row.status}</Pill></td>
        </tr>; })}</tbody>
      </table></div> : <EmptyState title="Даних для звіту ще немає" />}
    </>}
  </div>;
}
