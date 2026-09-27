"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Clock3, FileText, MapPin, Paperclip, Plus, Repeat2, Trash2, Users } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, GroupSelect, LoadingState, Modal, Pill, StatusMessage, WorkspaceHeader } from "@/components/common/workspace-ui";
import { BehaviorCardAction, MonthlyStarThemeBanner } from "@/components/star/monthly-star";
import { combineLocalDateTime, EVENT_LABELS, formatDate, formatDateTime, formatTime, kyivDateKey, safeError, toDateInput } from "@/lib/domain/format";
import type { Announcement, EventItem, FileAsset, GroupSummary, MethodologyTask, Profile, Venue } from "@/lib/domain/types";
import { enqueueAttendance, persistAttendance, type AttendanceQueueItem } from "@/lib/offline/attendance-queue";
import { openPrivateFile, uploadPrivateFile } from "@/lib/supabase/files";

interface Props { client: SupabaseClient; profile: Profile; groups: GroupSummary[]; }
type EventMode = { kind: "view" | "edit" | "create"; event?: EventItem; date?: string };

const ORGANIZATIONAL_NEED_OPTIONS = ["Підготовка поля", "Автобус", "Оператор", "Лікар", "Документи", "Інше"] as const;
type OrganizationalNeedOption = typeof ORGANIZATIONAL_NEED_OPTIONS[number];

function supportsOrganizationalNeeds(eventType: EventItem["event_type"]) {
  return eventType === "oblast" || eventType === "ukraine" || eventType === "tournament";
}

function parseOrganizationalNeeds(value?: string | null) {
  const selected: OrganizationalNeedOption[] = [];
  const other: string[] = [];
  for (const rawPart of (value ?? "").split(/[;\n]/)) {
    const part = rawPart.trim();
    if (!part) continue;
    if (ORGANIZATIONAL_NEED_OPTIONS.slice(0, -1).includes(part as Exclude<OrganizationalNeedOption, "Інше">)) {
      selected.push(part as OrganizationalNeedOption);
    } else {
      const detail = part.replace(/^Інше:\s*/i, "").trim();
      if (detail) other.push(detail);
    }
  }
  if (other.length) selected.push("Інше");
  return { selected: [...new Set(selected)], other: other.join("; ") };
}

function serializeOrganizationalNeeds(selected: OrganizationalNeedOption[], other: string) {
  const values = ORGANIZATIONAL_NEED_OPTIONS
    .filter((option) => option !== "Інше" && selected.includes(option))
    .map(String);
  if (selected.includes("Інше") && other.trim()) values.push(`Інше: ${other.trim()}`);
  return values.join("; ");
}

function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth() + 1, 1); }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

function attendanceSessions(event: EventItem) {
  const value = event.attendance_sessions;
  return Array.isArray(value) ? value : value ? [value] : [];
}

function calendarCells(month: Date) {
  const first = startOfMonth(month);
  const leading = (first.getDay() + 6) % 7;
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const result: Array<Date | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= count; day += 1) result.push(new Date(month.getFullYear(), month.getMonth(), day));
  while (result.length % 7) result.push(null);
  return result;
}

export function CoachPlan({ client, profile, groups }: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState(groups[0]?.id ?? "");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [tasks, setTasks] = useState<MethodologyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventMode, setEventMode] = useState<EventMode | null>(null);
  const [attendanceEvent, setAttendanceEvent] = useState<EventItem | null>(null);
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!selectedGroupId && groups[0]) setSelectedGroupId(groups[0].id);
    if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) setSelectedGroupId(groups[0]?.id ?? "");
  }, [groups, selectedGroupId]);

  const load = useCallback(async () => {
    if (!groups.length) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const today = new Date();
    const selectedStart = startOfMonth(month);
    const selectedEnd = endOfMonth(month);
    const overdueStart = new Date(today); overdueStart.setDate(today.getDate() - 45);
    const rangeStart = new Date(Math.min(selectedStart.getTime(), overdueStart.getTime()));
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 2);
    const rangeEnd = new Date(Math.max(selectedEnd.getTime(), tomorrow.getTime()));
    const groupIds = groups.map((group) => group.id);
    const nowIso = new Date().toISOString();
    const [eventResult, announcementResult, venueResult, taskResult] = await Promise.all([
      client.from("events").select("id, group_id, event_type, start_at, duration_minutes, venue_id, task_id, coach_id, title, notes, organizational_need, coach_comment, needs_substitute, substitute_coach_id, original_start_at, is_rescheduled, status, groups(code, age, group_kind), venues(name), methodology_tasks(title), attendance_sessions(id, completed_at)").in("group_id", groupIds).gte("start_at", rangeStart.toISOString()).lt("start_at", rangeEnd.toISOString()).neq("status", "cancelled").order("start_at"),
      client.from("announcements").select("id, title, body, starts_at, ends_at, require_acknowledgement, announcement_reads(read_at)").eq("is_active", true).lte("starts_at", nowIso).or(`ends_at.is.null,ends_at.gte.${nowIso}`).order("starts_at", { ascending: false }),
      client.from("venues").select("id, name, venue_type, is_active").eq("is_active", true).order("name"),
      client.from("methodology_tasks").select("id, phase, level, component, title, description, age_from, age_to, sort_order, is_active").eq("is_active", true).order("sort_order"),
    ]);
    setLoading(false);
    if (eventResult.error || announcementResult.error || venueResult.error || taskResult.error) {
      setError("Не вдалося завантажити план. Перевірте з’єднання і повторіть.");
      return;
    }
    setEvents((eventResult.data ?? []) as unknown as EventItem[]);
    setAnnouncements((announcementResult.data ?? []) as unknown as Announcement[]);
    setVenues((venueResult.data ?? []) as Venue[]);
    setTasks((taskResult.data ?? []) as MethodologyTask[]);
  }, [client, groups, month]);

  useEffect(() => { void load(); }, [load]);

  const todayEvents = useMemo(() => events.filter((event) => sameDay(new Date(event.start_at), new Date())), [events]);
  const unfinished = useMemo(() => events.filter((event) => event.event_type === "training" && new Date(event.start_at).getTime() < openedAt && !attendanceSessions(event).some((session) => session.completed_at)), [events, openedAt]);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0];
  const monthEvents = useMemo(() => events.filter((event) => event.group_id === selectedGroupId && new Date(event.start_at) >= startOfMonth(month) && new Date(event.start_at) < endOfMonth(month)), [events, selectedGroupId, month]);

  async function acknowledge(id: string) {
    const result = await client.from("announcement_reads").upsert({ announcement_id: id, profile_id: profile.id, read_at: new Date().toISOString() }, { onConflict: "announcement_id,profile_id" });
    if (!result.error) setAnnouncements((items) => items.map((item) => item.id === id ? { ...item, announcement_reads: [{ read_at: new Date().toISOString() }] } : item));
  }

  if (loading) return <LoadingState label="Завантажуємо план…" />;
  if (!groups.length) return <><WorkspaceHeader title="План" description="Події, присутність і календар" /><EmptyState title="Команди ще не призначені">Адміністратор має призначити вам щонайменше одну команду.</EmptyState></>;

  return <div className="workspace-stack">
    <WorkspaceHeader eyebrow="Робочий день" title="План" description="Події всіх ваших команд і календар вибраної команди" actions={<button className="primary-action" type="button" onClick={() => setEventMode({ kind: "create", date: toDateInput(new Date()) })}><CalendarPlus size={18} />Запланувати</button>} />
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
    <MonthlyStarThemeBanner client={client} />
    {announcements.length > 0 && <section className="announcement-list" aria-label="Оголошення адміністратора">{announcements.map((announcement) => <article key={announcement.id} className="announcement-card"><div><Pill tone="plum">Оголошення</Pill><h2>{announcement.title}</h2><p>{announcement.body}</p>{announcement.ends_at && <small>До {formatDate(announcement.ends_at)}</small>}</div>{announcement.require_acknowledgement && !(announcement.announcement_reads ?? []).length && <button type="button" className="secondary-action" onClick={() => void acknowledge(announcement.id)}><Check size={17} />Ознайомився</button>}</article>)}</section>}

    <section className="panel-section"><div className="section-title-row"><div><p className="eyebrow">Усі закріплені команди</p><h2>Сьогодні</h2></div><Pill tone="teal">{todayEvents.length} подій</Pill></div>{todayEvents.length ? <div className="event-card-grid">{todayEvents.map((event) => <EventCard event={event} key={event.id} onOpen={() => setEventMode({ kind: "view", event })} />)}</div> : <EmptyState title="Сьогодні подій немає" />}</section>

    {unfinished.length > 0 && <section className="panel-section attention-section"><div className="section-title-row"><div><p className="eyebrow">Потребує дії</p><h2>Потрібно завершити</h2></div><Pill tone="warning">{unfinished.length}</Pill></div><div className="event-card-grid">{unfinished.map((event) => <button type="button" className="unfinished-card" key={event.id} onClick={() => setAttendanceEvent(event)}><span>Присутність не збережена</span><b>{event.groups?.code} · {formatDateTime(event.start_at)}</b></button>)}</div></section>}

    <section className="panel-section calendar-panel"><div className="section-title-row calendar-tools"><div><p className="eyebrow">Планування окремої команди</p><h2>Моя команда</h2></div><GroupSelect groups={groups} value={selectedGroupId} onChange={setSelectedGroupId} /></div><div className="month-switcher"><button type="button" aria-label="Попередній місяць" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button><strong>{new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric" }).format(month)}</strong><button type="button" aria-label="Наступний місяць" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button></div><Calendar month={month} events={monthEvents} onCreate={(date) => setEventMode({ kind: "create", date })} onEdit={(event) => setEventMode({ kind: "edit", event })} /></section>

    {eventMode?.kind === "view" && eventMode.event && <EventDetails client={client} event={eventMode.event} onClose={() => setEventMode(null)} onAttendance={() => { setAttendanceEvent(eventMode.event ?? null); setEventMode(null); }} />}
    {(eventMode?.kind === "create" || eventMode?.kind === "edit") && <EventEditor key={`${eventMode.kind}:${eventMode.event?.id ?? eventMode.date ?? "new"}`} client={client} profile={profile} group={selectedGroup} event={eventMode.event} isCreating={eventMode.kind === "create"} initialDate={eventMode.date} venues={venues} tasks={tasks.filter((task) => selectedGroup?.age != null && task.age_from <= selectedGroup.age && task.age_to >= selectedGroup.age)} onClose={() => setEventMode(null)} onCreateSimilar={(source) => setEventMode({ kind: "create", event: source, date: toDateInput(new Date()) })} onSaved={() => { setEventMode(null); void load(); }} onAttendance={(event) => { setEventMode(null); setAttendanceEvent(event); }} />}
    {attendanceEvent && <AttendanceModal client={client} profile={profile} event={attendanceEvent} onClose={() => setAttendanceEvent(null)} onSaved={() => { setAttendanceEvent(null); void load(); }} />}
  </div>;
}

function EventCard({ event, onOpen }: { event: EventItem; onOpen: () => void }) {
  return <button type="button" className="event-card" onClick={onOpen}><span className="event-time">{formatTime(event.start_at)}</span><div><div className="event-card-heading"><b>{EVENT_LABELS[event.event_type]}</b><Pill tone="plum">{event.groups?.code ?? "—"}</Pill></div><p>{event.methodology_tasks?.title ?? event.title ?? "Без навчального завдання"}</p><small><MapPin size={14} />{event.venues?.name ?? "Майданчик не вказано"}</small></div></button>;
}

function Calendar({ month, events, onCreate, onEdit }: { month: Date; events: EventItem[]; onCreate: (date: string) => void; onEdit: (event: EventItem) => void }) {
  const cells = calendarCells(month);
  return <div className="calendar-wrap"><div className="calendar-weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((date, index) => {
    if (!date) return <div className="calendar-day empty" key={`empty-${index}`} />;
    const dayEvents = events.filter((event) => sameDay(new Date(event.start_at), date));
    const isToday = sameDay(date, new Date());
    return <div className={`calendar-day${isToday ? " today" : ""}`} key={date.toISOString()}><div className="calendar-date-row"><span>{date.getDate()}</span><button type="button" className="calendar-plus" aria-label={`Додати подію ${formatDate(date)}`} onClick={() => onCreate(toDateInput(date))}><Plus /></button></div><div className="calendar-events">{dayEvents.map((event) => <button type="button" className={`calendar-event ${event.event_type}`} key={event.id} onClick={() => onEdit(event)}><b>{formatTime(event.start_at)}</b><span>{EVENT_LABELS[event.event_type]}</span><small>{event.groups?.code}</small></button>)}</div></div>;
  })}</div></div>;
}

function EventDetails({ client, event, onClose, onAttendance }: { client: SupabaseClient; event: EventItem; onClose: () => void; onAttendance: () => void }) {
  const [assets, setAssets] = useState<FileAsset[]>([]);
  useEffect(() => {
    let active = true;
    const promises = [client.from("event_materials").select("file_assets(*)").eq("event_id", event.id)];
    if (event.task_id) promises.push(client.from("methodology_materials").select("file_assets(*)").eq("task_id", event.task_id));
    void Promise.all(promises).then((results) => {
      if (!active) return;
      const found = results.flatMap((result) => (result.data ?? []).flatMap((row) => {
        const value = (row as unknown as { file_assets?: FileAsset | FileAsset[] | null }).file_assets;
        return Array.isArray(value) ? value : value ? [value] : [];
      }));
      setAssets([...new Map(found.map((asset) => [asset.id, asset])).values()]);
    });
    return () => { active = false; };
  }, [client, event.id, event.task_id]);
  return <Modal title={`${EVENT_LABELS[event.event_type]} · ${event.groups?.code ?? ""}`} onClose={onClose} footer={<><button type="button" className="secondary-action" onClick={onClose}>Закрити</button>{event.event_type === "training" && <button type="button" className="primary-action" onClick={onAttendance}><Users size={18} />Присутність</button>}</>}><div className="detail-list"><div><Clock3 /><span><b>{formatDateTime(event.start_at)}</b><small>{event.duration_minutes} хвилин</small></span></div><div><MapPin /><span><b>{event.venues?.name ?? "Майданчик не вказано"}</b></span></div><div><FileText /><span><b>{event.groups?.group_kind === "goalkeeper" ? "Завдання заняття" : "Навчальне завдання"}</b><small>{event.methodology_tasks?.title ?? event.title ?? "Не вибрано"}</small></span></div></div>{event.notes && <div className="text-block"><h3>Уточнення тренера</h3><p>{event.notes}</p></div>}{event.organizational_need && <div className="text-block"><h3>Організаційні потреби</h3><p>{event.organizational_need}</p></div>}<div className="text-block"><h3>Матеріали</h3>{assets.length ? <div className="file-list">{assets.map((asset) => <button type="button" key={asset.id} onClick={() => void openPrivateFile(client, asset)}><Paperclip size={17} /><span>{asset.original_name}</span></button>)}</div> : <p className="muted">Документів немає.</p>}</div></Modal>;
}

function EventEditor({ client, profile, group, event, isCreating, initialDate, venues, tasks, onClose, onCreateSimilar, onSaved, onAttendance }: { client: SupabaseClient; profile: Profile; group?: GroupSummary; event?: EventItem; isCreating: boolean; initialDate?: string; venues: Venue[]; tasks: MethodologyTask[]; onClose: () => void; onCreateSimilar: (event: EventItem) => void; onSaved: () => void; onAttendance: (event: EventItem) => void }) {
  const [eventType, setEventType] = useState<EventItem["event_type"]>(event?.event_type ?? "training");
  const [date, setDate] = useState(isCreating && initialDate ? initialDate : event ? toDateInput(event.start_at) : toDateInput(new Date()));
  const [time, setTime] = useState(event ? new Date(event.start_at).toTimeString().slice(0, 5) : "17:00");
  const [duration, setDuration] = useState(event?.duration_minutes ?? 75);
  const [venueId, setVenueId] = useState(event?.venue_id ?? venues[0]?.id ?? "");
  const [taskId, setTaskId] = useState(event?.task_id ?? "");
  const [title, setTitle] = useState(event?.title ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const initialNeeds = parseOrganizationalNeeds(event?.organizational_need);
  const [selectedNeeds, setSelectedNeeds] = useState<OrganizationalNeedOption[]>(initialNeeds.selected);
  const [otherNeed, setOtherNeed] = useState(initialNeeds.other);
  const [comment, setComment] = useState(event?.coach_comment ?? "");
  const [needsSubstitute, setNeedsSubstitute] = useState(event?.needs_substitute ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const conflictNoticeRef = useRef<HTMLDivElement>(null);
  const [openedAt] = useState(() => Date.now());
  const isConflict = message?.startsWith("Конфлікт:") ?? false;

  useEffect(() => {
    if (!isConflict) return;
    const frame = window.requestAnimationFrame(() => {
      conflictNoticeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      conflictNoticeRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isConflict, message]);

  useEffect(() => {
    if (!taskId || !group) { setUsageCount(0); return; }
    let active = true;
    void client.from("events").select("id", { count: "exact", head: true }).eq("group_id", group.id).eq("task_id", taskId).neq("status", "cancelled").then(({ count }) => { if (active) setUsageCount(count ?? 0); });
    return () => { active = false; };
  }, [client, group, taskId]);

  async function persist() {
    if (!group) return;
    setBusy(true); setMessage(null);
    const creating = isCreating || !event;
    const nextStart = combineLocalDateTime(date, time);
    const rescheduled = !creating && !!event && new Date(nextStart).getTime() !== new Date(event.start_at).getTime();
    const organizationalNeed = supportsOrganizationalNeeds(eventType) ? serializeOrganizationalNeeds(selectedNeeds, otherNeed) : "";
    const payload = {
      group_id: group.id,
      event_type: eventType,
      start_at: nextStart,
      duration_minutes: duration,
      venue_id: venueId || null,
      task_id: eventType === "training" && taskId ? taskId : null,
      coach_id: profile.id,
      title: group.group_kind === "goalkeeper" && eventType === "training" ? title.trim() || null : event?.title ?? null,
      notes: notes || null,
      organizational_need: organizationalNeed || null,
      coach_comment: comment || null,
      needs_substitute: needsSubstitute,
      original_start_at: creating ? null : rescheduled ? event?.original_start_at ?? event?.start_at ?? null : event?.original_start_at ?? null,
      is_rescheduled: creating ? false : rescheduled || event?.is_rescheduled || false,
      updated_by: profile.id,
      ...(creating ? { created_by: profile.id, idempotency_key: crypto.randomUUID() } : {}),
    };
    const result = creating
      ? await client.from("events").insert(payload).select("id").single()
      : await client.from("events").update(payload).eq("id", event!.id).select("id").single();
    if (result.error) {
      setBusy(false);
      setMessage(safeError(result.error, "Подію не збережено. Перевірте конфлікти часу й поля."));
      return;
    }
    const savedId = result.data.id as string;
    await client.from("operational_items").delete().eq("group_id", group.id).eq("item_type", "conflict").eq("status", "todo").eq("created_by", profile.id);
    const operational = [
      needsSubstitute ? { item_type: "coach_substitution", title: "Потрібна заміна тренера", comment: comment || null } : null,
      organizationalNeed ? { item_type: "organizational_need", title: "Організаційні потреби", comment: organizationalNeed } : null,
      comment ? { item_type: "comment", title: "Коментар тренера", comment } : null,
    ].filter(Boolean).map((item) => ({ ...item, group_id: group.id, event_id: savedId, status: "todo", due_at: nextStart, created_by: profile.id, dedupe_key: `${savedId}:${(item as { item_type: string }).item_type}` }));
    if (operational.length) await client.from("operational_items").upsert(operational, { onConflict: "dedupe_key" });
    if (!creating) {
      const activeTypes = new Set(operational.map((item) => (item as { item_type: string }).item_type));
      for (const itemType of ["coach_substitution", "organizational_need", "comment"] as const) {
        if (!activeTypes.has(itemType)) await client.from("operational_items").delete().eq("event_id", savedId).eq("item_type", itemType).eq("status", "todo").eq("created_by", profile.id);
      }
    }
    if (file && (taskId || group.group_kind === "goalkeeper")) {
      try {
        const asset = await uploadPrivateFile(client, file, { bucket: "task-documents", ownerId: profile.id, groupId: group.id, age: group.age, contextType: "event_task_material" });
        const linkResult = group.group_kind === "goalkeeper"
          ? await client.rpc("attach_event_material", { p_event_id: savedId, p_file_asset_id: asset.id })
          : await client.rpc("attach_event_task_material", { p_event_id: savedId, p_task_id: taskId, p_file_asset_id: asset.id });
        if (linkResult.error) throw linkResult.error;
      } catch (uploadError) { setMessage(safeError(uploadError, "Подію збережено, але документ не завантажився.")); setBusy(false); return; }
    }
    setBusy(false); onSaved();
  }

  function save(eventForm: FormEvent) {
    eventForm.preventDefault();
    void persist();
  }

  async function remove() {
    if (!event || !confirm("Видалити цю подію? Подія з присутністю не буде видалена.")) return;
    setBusy(true); setMessage(null);
    const result = await client.from("events").delete().eq("id", event.id);
    setBusy(false);
    if (result.error) { setMessage("Подію не видалено. Якщо вже є присутність, скасуйте подію через адміністратора."); return; }
    onSaved();
  }

  const footer = <><button type="button" className="secondary-action" onClick={onClose}>Скасувати</button>{event && !isCreating && <button type="button" className="danger-action" onClick={() => void remove()} disabled={busy}><Trash2 size={17} />Видалити</button>}{event && !isCreating && <button type="button" className="secondary-action" onClick={() => onCreateSimilar(event)} disabled={busy}><Repeat2 size={17} />Створити подібне</button>}<button form="event-form" className="primary-action" disabled={busy}>{busy ? "Збереження…" : isCreating ? "Створити подію" : "Зберегти зміни"}</button></>;
  return <Modal title={event && !isCreating ? `Редагування · ${group?.code ?? ""}` : `Нова подія · ${group?.code ?? ""}`} onClose={onClose} wide footer={footer}><form id="event-form" className="form-grid" onSubmit={save}>{message && <div ref={conflictNoticeRef} className={`span-2${isConflict ? " conflict-notice" : ""}`} tabIndex={isConflict ? -1 : undefined}><StatusMessage kind={isConflict ? "error" : "warning"}>{message}</StatusMessage></div>}<label><span>Тип події</span><select value={eventType} onChange={(e) => setEventType(e.target.value as EventItem["event_type"])}>{Object.entries(EVENT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Дата</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label><label><span>Час</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></label><label><span>Тривалість, хв</span><input type="number" min={15} max={360} value={duration} onChange={(e) => setDuration(Number(e.target.value))} required /></label><label className="span-2"><span>Поле або майданчик</span><select value={venueId} onChange={(e) => setVenueId(e.target.value)}><option value="">Не вказано</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>{eventType === "training" && <>{group?.group_kind === "goalkeeper" ? <label className="span-2"><span>Завдання заняття</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Наприклад, гра на виходах" /></label> : <label className="span-2"><span>Навчальне завдання</span><select value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">Не вибрано</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select>{taskId && <small className="field-hint">Ця команда вже використовувала завдання {usageCount} разів.</small>}</label>}<label className="span-2"><span>Документ із вправами</span><input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" disabled={group?.group_kind !== "goalkeeper" && !taskId} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{group?.group_kind !== "goalkeeper" && !taskId && <small className="field-hint">Спочатку виберіть навчальне завдання.</small>}</label></>}<label className="span-2"><span>Уточнення тренера</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></label>{supportsOrganizationalNeeds(eventType) && <fieldset className="span-2 organizational-needs"><legend>Організаційні потреби</legend><p>Позначте все, що потрібно підготувати для цієї події.</p><div className="checkbox-grid">{ORGANIZATIONAL_NEED_OPTIONS.map((option) => <label className="check-field" key={option}><input type="checkbox" checked={selectedNeeds.includes(option)} onChange={(input) => setSelectedNeeds((current) => input.target.checked ? [...current, option] : current.filter((item) => item !== option))} /><span>{option}</span></label>)}</div>{selectedNeeds.includes("Інше") && <label className="other-need"><span>Уточніть іншу потребу</span><input value={otherNeed} onChange={(input) => setOtherNeed(input.target.value)} required /></label>}</fieldset>}<label className="span-2"><span>Додатковий коментар</span><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /></label><label className="check-field span-2"><input type="checkbox" checked={needsSubstitute} onChange={(e) => setNeedsSubstitute(e.target.checked)} /><span>Потрібна заміна тренера</span></label>{event && event.event_type === "training" && new Date(event.start_at).getTime() < openedAt && <div className="span-2"><button type="button" className="secondary-action" onClick={() => onAttendance(event)}><Users size={18} />Відмітити присутність</button></div>}</form></Modal>;
}

function AttendanceModal({ client, profile, event, onClose, onSaved }: { client: SupabaseClient; profile: Profile; event: EventItem; onClose: () => void; onSaved: () => void }) {
  const [players, setPlayers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [records, setRecords] = useState<Record<string, { status: "present" | "absent"; note: string }>>({});
  const [cardedPlayerIds, setCardedPlayerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([
      client.from("players").select("id, full_name").eq("group_id", event.group_id).eq("is_active", true).order("full_name"),
      client.from("attendance_sessions").select("id, attendance_records(player_id, status, note)").eq("event_id", event.id).maybeSingle(),
      client.from("player_behavior_cards").select("player_id").eq("event_id", event.id).eq("is_voided", false),
    ]).then(([playerResult, sessionResult, cardResult]) => {
      if (!active) return;
      const list = (playerResult.data ?? []) as Array<{ id: string; full_name: string }>;
      const existing = ((sessionResult.data as unknown as { attendance_records?: Array<{ player_id: string; status: "present" | "absent"; note?: string | null }> } | null)?.attendance_records ?? []);
      const initial: Record<string, { status: "present" | "absent"; note: string }> = {};
      for (const player of list) { const row = existing.find((item) => item.player_id === player.id); initial[player.id] = { status: row?.status ?? "present", note: row?.note ?? "" }; }
      setPlayers(list);
      setRecords(initial);
      setCardedPlayerIds(new Set((cardResult.data ?? []).map((card) => card.player_id as string)));
      if (playerResult.error || sessionResult.error || cardResult.error) setMessage("Частину попередніх відміток не вдалося завантажити. Перевірте список перед збереженням.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [client, event.group_id, event.id]);

  function setStatus(playerId: string, status: "present" | "absent") {
    setRecords((value) => ({
      ...value,
      [playerId]: { ...value[playerId], status, note: status === "present" ? "" : value[playerId]?.note ?? "" },
    }));
  }

  function markAllPresent() {
    setRecords((value) => Object.fromEntries(players.map((player) => [player.id, { ...value[player.id], status: "present", note: "" }])));
  }

  async function save() {
    setBusy(true); setMessage(null);
    const item: AttendanceQueueItem = { idempotencyKey: crypto.randomUUID(), eventId: event.id, completedBy: profile.id, createdAt: new Date().toISOString(), records: players.map((player) => ({ player_id: player.id, ...records[player.id] })) };
    if (!navigator.onLine) {
      try { await enqueueAttendance(item); setMessage("Збережено офлайн. Дані синхронізуються після відновлення мережі."); window.setTimeout(onSaved, 800); }
      catch { setMessage("Не вдалося створити офлайн-чергу на цьому пристрої. Не закривайте вікно та повторіть після відновлення мережі."); }
      setBusy(false); return;
    }
    try { await persistAttendance(client, item); setBusy(false); onSaved(); }
    catch {
      try { await enqueueAttendance(item); setMessage("Сервер недоступний. Присутність безпечно додано до черги синхронізації."); window.setTimeout(onSaved, 1000); }
      catch { setMessage("Сервер і офлайн-черга недоступні. Дані не втрачено на екрані — повторіть збереження після відновлення мережі."); }
      setBusy(false);
    }
  }

  const presentCount = Object.values(records).filter((record) => record.status === "present").length;
  const absentCount = Math.max(0, players.length - presentCount);

  return <Modal title={`Присутність і картки · ${event.groups?.code ?? ""}`} onClose={onClose} wide footer={<><button className="secondary-action" type="button" onClick={onClose}>Скасувати</button><button className="primary-action" type="button" onClick={() => void save()} disabled={busy || loading}>{busy ? "Збереження…" : "Зберегти присутність"}</button></>}>
    {loading ? <LoadingState /> : players.length ? <div className="attendance-list">
      <div className="attendance-help">
        <div><b>Відмітьте кожного гравця</b><p>Виберіть «Присутній» або «Відсутній». Жовта картка доступна тут один раз для кожного гравця в цій події.</p></div>
        <div className="attendance-summary"><Pill tone="teal">{presentCount} присутні</Pill><Pill tone={absentCount ? "warning" : "neutral"}>{absentCount} відсутні</Pill></div>
        <button className="secondary-action small" type="button" onClick={markAllPresent}><Check size={16} />Усі присутні</button>
      </div>
      {players.map((player) => {
        const record = records[player.id] ?? { status: "present" as const, note: "" };
        const hasCard = cardedPlayerIds.has(player.id);
        return <article className={`attendance-row ${record.status}`} key={player.id}>
          <div className="attendance-player-name"><b>{player.full_name}</b><small>{record.status === "present" ? "На занятті" : "Не був на занятті"}</small></div>
          <div className="attendance-status-choice" role="group" aria-label={`Присутність · ${player.full_name}`}>
            <button type="button" className={record.status === "present" ? "selected present" : ""} aria-pressed={record.status === "present"} onClick={() => setStatus(player.id, "present")}><Check size={16} />Присутній</button>
            <button type="button" className={record.status === "absent" ? "selected absent" : ""} aria-pressed={record.status === "absent"} onClick={() => setStatus(player.id, "absent")}>Відсутній</button>
          </div>
          <div className="attendance-card-control">
            {hasCard ? <span className="attendance-card-recorded"><Check size={16} />Картку зафіксовано</span> : record.status === "present" ? <BehaviorCardAction client={client} profile={profile} player={player} groupId={event.group_id} eventId={event.id} occurredOn={kyivDateKey(new Date(event.start_at))} label="Жовта картка" className="yellow-card-action small" onSaved={() => setCardedPlayerIds((current) => new Set(current).add(player.id))} /> : <span className="attendance-card-unavailable">Картка недоступна для відсутнього</span>}
          </div>
          {record.status === "absent" && <label className="attendance-note"><span>Причина або примітка — необов’язково</span><input value={record.note} onChange={(input) => setRecords((value) => ({ ...value, [player.id]: { ...value[player.id], note: input.target.value } }))} placeholder="Наприклад, хворіє" /></label>}
        </article>;
      })}
      <p className="attendance-card-note">Жовта картка зберігається одразу після підтвердження. Присутність збережеться кнопкою внизу.</p>
    </div> : <EmptyState title="У команді немає активних гравців" />}
    {message && <StatusMessage kind="warning">{message}</StatusMessage>}
  </Modal>;
}
