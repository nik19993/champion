"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarClock, CalendarRange, CheckCircle2, CircleDashed, TriangleAlert } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState, Modal, Pill, StatusMessage, WorkspaceHeader } from "@/components/common/workspace-ui";
import { combineKyivDateTime, EVENT_LABELS, formatDateTime, OPERATIONAL_STATUS_LABELS, OPERATIONAL_TYPE_LABELS, safeError, toKyivDateInput, toKyivTimeInput } from "@/lib/domain/format";
import type { EventItem, OperationalItem, OperationalStatus, Profile, Venue } from "@/lib/domain/types";

type RangeMode = "7" | "10" | "30" | "month" | "custom";

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

export function AdminPlan({ client }: { client: SupabaseClient }) {
  const [mode, setMode] = useState<RangeMode>("7");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [items, setItems] = useState<OperationalItem[]>([]);
  const [openedEventId, setOpenedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const range = useMemo(() => rangeFor(mode, customStart, customEnd), [customEnd, customStart, mode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await client.from("operational_items").select("id, group_id, event_id, item_type, status, title, comment, due_at, created_at, groups(code), events(start_at, event_type)").neq("item_type", "conflict").order("status").order("created_at", { ascending: false }).limit(1000);
    setLoading(false);
    if (result.error) { setError("Не вдалося завантажити операційний план."); return; }
    const start = range.start.getTime();
    const end = range.end.getTime();
    setItems(((result.data ?? []) as unknown as OperationalItem[]).filter((item) => {
      const relevantAt = item.due_at ?? item.events?.start_at ?? item.created_at;
      const timestamp = new Date(relevantAt).getTime();
      return timestamp >= start && timestamp <= end;
    }));
  }, [client, range.end, range.start]);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(id: string, status: OperationalStatus) {
    const result = await client.from("operational_items").update({ status }).eq("id", id);
    if (result.error) { setError("Статус не збережено."); return; }
    setItems((rows) => rows.map((item) => item.id === id ? { ...item, status } : item));
  }

  return <div className="workspace-stack">
    <WorkspaceHeader eyebrow="Операційне керування" title="План адміністратора" description="Тільки ситуації, які потребують уваги або рішення" />
    <section className="filter-bar">
      <label><span>Період</span><select value={mode} onChange={(event) => setMode(event.target.value as RangeMode)}><option value="7">7 днів</option><option value="10">10 днів</option><option value="30">30 днів</option><option value="month">Поточний місяць</option><option value="custom">Власний діапазон</option></select></label>
      {mode === "custom" && <><label><span>Від</span><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label><span>До</span><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></>}
      <Pill tone="plum"><CalendarRange size={15} />{items.length} ситуацій</Pill>
    </section>
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
    {loading ? <LoadingState /> : items.length ? <div className="operational-list">{items.map((item) => <article key={item.id} className={item.item_type === "coach_substitution" ? "substitution" : ""}>
      <div className="operational-icon">{item.item_type === "coach_substitution" || item.item_type === "conflict" ? <TriangleAlert /> : item.status === "done" ? <CheckCircle2 /> : <CircleDashed />}</div>
      <div className="operational-copy"><div><Pill tone={item.item_type === "coach_substitution" ? "danger" : "warning"}>{OPERATIONAL_TYPE_LABELS[item.item_type]}</Pill><Pill tone="plum">{item.groups?.code ?? "—"}</Pill></div><h2>{item.title}</h2>{item.comment && <p>{item.comment}</p>}<small>{item.events?.start_at ? formatDateTime(item.events.start_at) : formatDateTime(item.created_at)}</small></div>
      <div className="operational-actions">{item.event_id && <button type="button" className="secondary-action" onClick={() => setOpenedEventId(item.event_id ?? null)}><CalendarClock size={17} />Відкрити подію</button>}<label className="status-select"><span>Стан</span><select value={item.status} onChange={(event) => void updateStatus(item.id, event.target.value as OperationalStatus)}>{Object.entries(OPERATIONAL_STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
    </article>)}</div> : <EmptyState title="За вибраний період ситуацій немає" />}
    {openedEventId && <AdminEventModal client={client} eventId={openedEventId} onClose={() => setOpenedEventId(null)} onSaved={() => { setOpenedEventId(null); void load(); }} />}
  </div>;
}

function AdminEventModal({ client, eventId, onClose, onSaved }: { client: SupabaseClient; eventId: string; onClose: () => void; onSaved: () => void }) {
  const [event, setEvent] = useState<EventItem | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [coaches, setCoaches] = useState<Profile[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState(75);
  const [venueId, setVenueId] = useState("");
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
      client.from("events").select("id, group_id, event_type, start_at, duration_minutes, venue_id, task_id, coach_id, substitute_coach_id, title, notes, organizational_need, coach_comment, needs_substitute, original_start_at, is_rescheduled, status, groups(code, age), venues(name), methodology_tasks(title)").eq("id", eventId).single(),
      client.from("venues").select("id, name, venue_type, is_active").eq("is_active", true).order("name"),
      client.from("profiles").select("id, full_name, first_name, last_name, middle_name, email, role, status").eq("role", "coach").eq("status", "active").order("full_name"),
    ]).then(([eventResult, venueResult, coachResult]) => {
      if (!active) return;
      if (eventResult.error) { setMessage("Подію не знайдено або доступ заборонено."); setLoading(false); return; }
      const row = eventResult.data as unknown as EventItem;
      setEvent(row);
      setDate(toKyivDateInput(row.start_at));
      setTime(toKyivTimeInput(row.start_at));
      setDuration(row.duration_minutes);
      setVenueId(row.venue_id ?? "");
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
    if (!event) return;
    setBusy(true);
    setMessage(null);
    const nextStart = combineKyivDateTime(date, time);
    const moved = new Date(nextStart).getTime() !== new Date(event.start_at).getTime();
    const stillNeedsSubstitute = needsSubstitute && !substituteId;
    const userResult = await client.auth.getUser();
    const actorId = userResult.data.user?.id ?? null;
    if (!actorId) { setBusy(false); setMessage("Сесію адміністратора не підтверджено."); return; }
    const result = await client.from("events").update({ start_at: nextStart, duration_minutes: duration, venue_id: venueId || null, coach_id: coachId, substitute_coach_id: substituteId || null, needs_substitute: stillNeedsSubstitute, status, original_start_at: moved ? event.original_start_at ?? event.start_at : event.original_start_at ?? null, is_rescheduled: moved || event.is_rescheduled || false, updated_by: actorId }).eq("id", event.id);
    if (result.error) { setBusy(false); setMessage(safeError(result.error, "Подію не збережено.")); return; }
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
  return <Modal title={event ? `${EVENT_LABELS[event.event_type]} · ${event.groups?.code ?? ""}` : "Подія"} onClose={onClose} wide footer={footer}>{loading ? <LoadingState /> : event ? <form id="admin-event-form" className="form-grid" onSubmit={save}><label><span>Дата</span><input type="date" value={date} onChange={(value) => setDate(value.target.value)} required /></label><label><span>Час (Київ)</span><input type="time" value={time} onChange={(value) => setTime(value.target.value)} required /></label><label><span>Тривалість, хв</span><input type="number" min={15} max={360} value={duration} onChange={(value) => setDuration(Number(value.target.value))} required /></label><label><span>Стан</span><select value={status} onChange={(value) => setStatus(value.target.value as EventItem["status"])}><option value="scheduled">Заплановано</option><option value="completed">Завершено</option><option value="cancelled">Скасовано</option></select></label><label className="span-2"><span>Поле або майданчик</span><select value={venueId} onChange={(value) => setVenueId(value.target.value)}><option value="">Не вказано</option>{venues.map((venue) => <option value={venue.id} key={venue.id}>{venue.name}</option>)}</select></label><label className="span-2"><span>Основний тренер</span><select value={coachId} onChange={(value) => { setCoachId(value.target.value); setPreviousCoachUnavailable(false); setNeedsSubstitute(false); setSubstituteId(""); }} required><option value="" disabled>{previousCoachUnavailable ? "Попереднього тренера видалено — оберіть нового" : "Оберіть тренера"}</option>{coaches.map((coach) => <option value={coach.id} key={coach.id}>{coach.full_name}</option>)}</select></label><label className="span-2"><span>Тренер на заміну</span><select value={substituteId} onChange={(value) => setSubstituteId(value.target.value)}><option value="">Не призначено</option>{coaches.filter((coach) => coach.id !== coachId).map((coach) => <option value={coach.id} key={coach.id}>{coach.full_name}</option>)}</select></label><label className="check-field span-2"><input type="checkbox" checked={needsSubstitute} onChange={(value) => setNeedsSubstitute(value.target.checked)} /><span>Потрібно знайти заміну</span></label>{event.methodology_tasks?.title && <div className="span-2 text-block"><h3>Навчальне завдання</h3><p>{event.methodology_tasks.title}</p></div>}{event.organizational_need && <div className="span-2 text-block"><h3>Організаційні потреби</h3><p>{event.organizational_need}</p></div>}{event.coach_comment && <div className="span-2 text-block"><h3>Коментар тренера</h3><p>{event.coach_comment}</p></div>}{message && <div className="span-2"><StatusMessage kind="error">{message}</StatusMessage></div>}</form> : <StatusMessage kind="error">{message ?? "Подію не завантажено."}</StatusMessage>}</Modal>;
}

export function AdminReport({ client }: { client: SupabaseClient }) {
  const [items, setItems] = useState<OperationalItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    void client.from("operational_items").select("id, group_id, event_id, item_type, status, title, comment, due_at, created_at, groups(code), events(start_at, event_type)").neq("item_type", "conflict").gte("created_at", start.toISOString()).order("created_at", { ascending: false }).then(({ data }) => { setItems((data ?? []) as unknown as OperationalItem[]); setLoading(false); });
  }, [client]);
  const counts = { todo: items.filter((item) => item.status === "todo").length, in_progress: items.filter((item) => item.status === "in_progress").length, done: items.filter((item) => item.status === "done").length };
  const completion = items.length ? Math.round((counts.done / items.length) * 100) : 0;
  const substitutions = items.filter((item) => item.item_type === "coach_substitution").length;
  return <div className="workspace-stack"><WorkspaceHeader eyebrow="Аналітика без редагування" title="Загальний звіт" description="Стан виконання за останні 30 днів; зміни вносяться тільки у Плані" />{loading ? <LoadingState /> : <><section className="metric-grid"><article><small>Потрібно зробити</small><b>{counts.todo}</b></article><article><small>В процесі</small><b>{counts.in_progress}</b></article><article><small>Виконано</small><b>{counts.done}</b></article><article><small>Виконання</small><b>{completion}%</b></article><article><small>Заміни тренера</small><b>{substitutions}</b></article></section>{items.length ? <div className="responsive-table"><table><thead><tr><th>Дата</th><th>Команда</th><th>Тип</th><th>Ситуація</th><th>Стан</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{formatDateTime(item.created_at)}</td><td>{item.groups?.code}</td><td>{OPERATIONAL_TYPE_LABELS[item.item_type]}</td><td>{item.title}</td><td><Pill tone={item.status === "done" ? "success" : item.status === "in_progress" ? "warning" : "neutral"}>{OPERATIONAL_STATUS_LABELS[item.status]}</Pill></td></tr>)}</tbody></table></div> : <EmptyState title="Даних для звіту ще немає" />}</>}</div>;
}
