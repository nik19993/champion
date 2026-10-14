"use client";

import { TrainingRegisterModal } from "@/components/coach/training-register";
import { trainingRegisterLabel, trainingRegisterState, type TrainingRegisterCompletion } from "@/lib/domain/training-register";
import { groupCode } from "@/lib/domain/seasons";
import { durationInput, durationMinutes } from "@/lib/domain/event-duration";
import { VenueBookingSelector } from "@/components/common/venue-booking-selector";
import { effectiveVenuePart, eventVenueLabel, normalizeVenuePart, VENUE_SELECT, type VenuePart } from "@/lib/domain/venue-booking";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Clock3, FileText, MapPin, Paperclip, Plus, Repeat2, Trash2, Users } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, GroupSelect, LoadingState, Modal, Pill, StatusMessage, WorkspaceHeader } from "@/components/common/workspace-ui";
import { DraftStatus, type DraftState } from "@/components/common/save-feedback";
import { MonthlyStarThemeBanner } from "@/components/star/monthly-star";
import { combineKyivDateTime, EVENT_LABELS, formatDate, formatDateTime, formatTime, kyivDateKey, kyivMonthBounds, safeError, toKyivDateInput, toKyivTimeInput } from "@/lib/domain/format";
import type { Announcement, EventItem, FileAsset, GroupSummary, MethodologyTask, Profile, Venue } from "@/lib/domain/types";
import { ATTENDANCE_QUEUE_CHANGED_EVENT, enqueueAttendance, persistAttendance, queuedAttendance, type AttendanceQueueItem } from "@/lib/offline/attendance-queue";
import { clearDraft, draftKey, readDraft, writeDraft } from "@/lib/offline/drafts";
import { openPrivateFile, uploadPrivateFile } from "@/lib/supabase/files";

interface Props { client: SupabaseClient; profile: Profile; groups: GroupSummary[]; }
type EventMode = { kind: "view" | "edit" | "create"; event?: EventItem; date?: string };

interface EventDraft {
  groupId?: string;
  eventType: EventItem["event_type"];
  date: string;
  time: string;
  duration: string;
  venueId: string;
  venuePart?: VenuePart;
  taskId: string;
  title: string;
  notes: string;
  selectedNeeds: OrganizationalNeedOption[];
  otherNeed: string;
  comment: string;
  needsSubstitute: boolean;
}

const ORGANIZATIONAL_NEED_OPTIONS = ["Підготовка поля", "Автобус", "Оператор", "Лікар", "Документи", "Інше"] as const;
const ALL_COACH_GROUPS = "__all_coach_groups__";
type OrganizationalNeedOption = typeof ORGANIZATIONAL_NEED_OPTIONS[number];

function supportsOrganizationalNeeds(eventType: EventItem["event_type"]) {
  return eventType === "oblast" || eventType === "ukraine" || eventType === "tournament";
}

function supportsBehaviorCards(eventType: EventItem["event_type"]) {
  return eventType === "training";
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
function plainDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
  const [month, setMonth] = useState(() => startOfMonth(new Date(`${kyivDateKey(new Date())}T12:00:00`)));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [tasks, setTasks] = useState<MethodologyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [eventMode, setEventMode] = useState<EventMode | null>(null);
  const [attendanceEvent, setAttendanceEvent] = useState<EventItem | null>(null);
  const [registerEvent, setRegisterEvent] = useState<EventItem | null>(null);
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!selectedGroupId && groups[0]) setSelectedGroupId(groups[0].id);
    if (selectedGroupId && selectedGroupId !== ALL_COACH_GROUPS && !groups.some((group) => group.id === selectedGroupId)) setSelectedGroupId(groups[0]?.id ?? "");
  }, [groups, selectedGroupId]);

  const load = useCallback(async (silent = false) => {
    if (!groups.length) { setLoading(false); return; }
    if (!silent) setLoading(true);
    setError(null);
    const today = new Date();
    const selectedBounds = kyivMonthBounds(month);
    const selectedStart = new Date(selectedBounds.start);
    const selectedEnd = new Date(selectedBounds.end);
    const overdueStart = new Date(today); overdueStart.setDate(today.getDate() - 45);
    const rangeStart = new Date(Math.min(selectedStart.getTime(), overdueStart.getTime()));
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 2);
    const rangeEnd = new Date(Math.max(selectedEnd.getTime(), tomorrow.getTime()));
    const groupIds = groups.map((group) => group.id);
    const nowIso = new Date().toISOString();
    const [eventResult, announcementResult, venueResult, taskResult, queue] = await Promise.all([
      client.from("events").select("id, group_id, event_type, start_at, duration_minutes, venue_id, venue_part, task_id, coach_id, title, notes, organizational_need, coach_comment, needs_substitute, substitute_coach_id, original_start_at, is_rescheduled, status, groups(code, display_code, cohort_birth_year, season, age, group_kind), venues(name, parent_venue_id), methodology_tasks(title), attendance_sessions(id, completed_at, server_version), training_register_completions(completed_at, completed_by, attendance_version, present_count, player_count, card_count)").in("group_id", groupIds).gte("start_at", rangeStart.toISOString()).lt("start_at", rangeEnd.toISOString()).neq("status", "cancelled").order("start_at"),
      client.from("announcements").select("id, title, body, starts_at, ends_at, require_acknowledgement, announcement_reads(read_at)").eq("is_active", true).lte("starts_at", nowIso).or(`ends_at.is.null,ends_at.gte.${nowIso}`).order("starts_at", { ascending: false }),
      client.from("venues").select(VENUE_SELECT).eq("is_active", true).order("name"),
      client.from("methodology_tasks").select("id, phase, level, component, title, description, age_from, age_to, sort_order, is_active").eq("is_active", true).order("sort_order"),
      queuedAttendance(profile.id).catch(() => null),
    ]);
    setLoading(false);
    if (eventResult.error || announcementResult.error || venueResult.error || taskResult.error) {
      setError("Не вдалося завантажити план. Перевірте з’єднання і повторіть.");
      return;
    }
    setEvents(((eventResult.data ?? []) as unknown as EventItem[]).map((event) => ({ ...event, attendance_sync: queue === null ? "unknown" : queue.some((item) => item.eventId === event.id) ? "pending" : "synced" })));
    setAnnouncements((announcementResult.data ?? []) as unknown as Announcement[]);
    setVenues((venueResult.data ?? []) as Venue[]);
    setTasks((taskResult.data ?? []) as MethodologyTask[]);
  }, [client, groups, month, profile.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const changed = () => { void load(true); };
    window.addEventListener(ATTENDANCE_QUEUE_CHANGED_EVENT, changed);
    return () => window.removeEventListener(ATTENDANCE_QUEUE_CHANGED_EVENT, changed);
  }, [load]);

  const todayKey = kyivDateKey(new Date());
  const todayEvents = useMemo(() => events.filter((event) => kyivDateKey(event.start_at) === todayKey), [events, todayKey]);
  const unfinished = useMemo(() => events.filter((event) => new Date(event.start_at).getTime() < openedAt && (supportsBehaviorCards(event.event_type) ? !trainingRegisterState(event).completed : !attendanceSessions(event).some((session) => session.completed_at))), [events, openedAt]);
  const monthKey = plainDateKey(month).slice(0, 7);
  const monthEvents = useMemo(() => events.filter((event) => (selectedGroupId === ALL_COACH_GROUPS || event.group_id === selectedGroupId) && groups.some((group) => group.id === event.group_id) && kyivDateKey(event.start_at).startsWith(monthKey)), [events, groups, selectedGroupId, monthKey]);

  function openAttendance(event: EventItem) {
    setEventMode(null);
    if (supportsBehaviorCards(event.event_type)) setRegisterEvent(event);
    else setAttendanceEvent(event);
  }

  function registerCompleted(completion: TrainingRegisterCompletion) {
    setRegisterEvent(null);
    setEventMode(null);
    setNotice(`✓ Облік завершено · присутні ${completion.present_count} із ${completion.player_count} · жовтих карток ${completion.card_count}`);
    void load(true);
  }

  async function acknowledge(id: string) {
    const result = await client.from("announcement_reads").upsert({ announcement_id: id, profile_id: profile.id, read_at: new Date().toISOString() }, { onConflict: "announcement_id,profile_id" });
    if (!result.error) setAnnouncements((items) => items.map((item) => item.id === id ? { ...item, announcement_reads: [{ read_at: new Date().toISOString() }] } : item));
  }

  if (loading) return <LoadingState label="Завантажуємо план…" />;
  if (!groups.length) return <><WorkspaceHeader title="План" description="Події, присутність і календар" /><EmptyState title="Команди ще не призначені">Адміністратор має призначити вам щонайменше одну команду.</EmptyState></>;

  return <div className="workspace-stack">
    <WorkspaceHeader eyebrow="Робочий день" title="План" description="Події та календар ваших призначених груп" actions={<button className="primary-action" type="button" onClick={() => setEventMode({ kind: "create", date: toKyivDateInput(new Date()) })}><CalendarPlus size={18} />Запланувати</button>} />
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
    {notice && <StatusMessage kind={notice.startsWith("Очікує синхронізації") ? "warning" : "success"}>{notice}</StatusMessage>}
    <MonthlyStarThemeBanner client={client} />
    {announcements.length > 0 && <section className="announcement-list" aria-label="Оголошення адміністратора">{announcements.map((announcement) => <article key={announcement.id} className="announcement-card"><div><Pill tone="plum">Оголошення</Pill><h2>{announcement.title}</h2><p>{announcement.body}</p>{announcement.ends_at && <small>До {formatDate(announcement.ends_at)}</small>}</div>{announcement.require_acknowledgement && !(announcement.announcement_reads ?? []).length && <button type="button" className="secondary-action" onClick={() => void acknowledge(announcement.id)}><Check size={17} />Ознайомився</button>}</article>)}</section>}

    <section className="panel-section"><div className="section-title-row"><div><p className="eyebrow">Усі закріплені команди</p><h2>Сьогодні</h2></div><Pill tone="teal">{todayEvents.length} подій</Pill></div>{todayEvents.length ? <div className="event-card-grid">{todayEvents.map((event) => <EventCard event={event} key={event.id} onOpen={() => setEventMode({ kind: "view", event })} />)}</div> : <EmptyState title="Сьогодні подій немає" />}</section>

    {unfinished.length > 0 && <section className="panel-section attention-section"><div className="section-title-row"><div><p className="eyebrow">Потребує дії</p><h2>Потрібно завершити</h2></div><Pill tone="warning">{unfinished.length}</Pill></div><div className="event-card-grid">{unfinished.map((event) => <button type="button" className="unfinished-card" key={event.id} onClick={() => openAttendance(event)}><span>{supportsBehaviorCards(event.event_type) ? trainingRegisterLabel(event) : "Присутність не збережена"}</span><b>{groupCode(event.groups)} · {formatDateTime(event.start_at)}</b></button>)}</div></section>}

    <section className="panel-section calendar-panel"><div className="section-title-row calendar-tools"><div><p className="eyebrow">Планування</p><h2>{selectedGroupId === ALL_COACH_GROUPS ? "Усі мої групи" : "Моя група"}</h2></div><GroupSelect groups={groups} value={selectedGroupId} onChange={setSelectedGroupId} allOption={{ value: ALL_COACH_GROUPS, label: "Усі мої групи" }} /></div><div className="month-switcher"><button type="button" aria-label="Попередній місяць" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button><strong>{new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric" }).format(month)}</strong><button type="button" aria-label="Наступний місяць" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button></div><Calendar month={month} events={monthEvents} onCreate={(date) => setEventMode({ kind: "create", date })} onEdit={(event) => setEventMode({ kind: "edit", event })} /></section>

    {eventMode?.kind === "view" && eventMode.event && <EventDetails client={client} event={eventMode.event} onClose={() => setEventMode(null)} onAttendance={() => { if (eventMode.event) openAttendance(eventMode.event); }} />}
    {(eventMode?.kind === "create" || eventMode?.kind === "edit") && <EventEditor key={`${eventMode.kind}:${eventMode.event?.id ?? eventMode.date ?? "new"}`} client={client} profile={profile} groups={groups} initialGroupId={selectedGroupId === ALL_COACH_GROUPS ? "" : selectedGroupId} event={eventMode.event} isCreating={eventMode.kind === "create"} initialDate={eventMode.date} venues={venues} tasks={tasks} onClose={() => setEventMode(null)} onCreateSimilar={(source) => setEventMode({ kind: "create", event: source, date: toKyivDateInput(new Date()) })} onSaved={(text) => { setEventMode(null); setNotice(text ?? "Подію збережено."); void load(); }} onAttendance={openAttendance} />}
    {attendanceEvent && <AttendanceModal client={client} profile={profile} event={attendanceEvent} onClose={() => setAttendanceEvent(null)} onSaved={(attendanceSynced) => {
      setAttendanceEvent(null);
      setNotice(attendanceSynced ? "Присутність збережено." : "Очікує синхронізації. Присутність збережена на пристрої.");
      void load(true);
    }} />}
    {registerEvent && <TrainingRegisterModal client={client} profile={profile} event={registerEvent} onClose={() => setRegisterEvent(null)} onChanged={() => { void load(true); }} onCompleted={registerCompleted} />}

  </div>;
}

function registerActionLabel(event: EventItem) {
  if (!supportsBehaviorCards(event.event_type)) return "Присутність";
  return trainingRegisterState(event).attendanceSaved ? "Переглянути / виправити відмітки" : "Присутність і картки";
}

function TrainingRegisterBadge({ event }: { event: EventItem }) {
  if (!supportsBehaviorCards(event.event_type)) return null;
  return <span className={`training-register-badge${trainingRegisterState(event).completed ? " completed" : ""}`}>{trainingRegisterLabel(event)}</span>;
}

function EventCard({ event, onOpen }: { event: EventItem; onOpen: () => void }) {
  return <button type="button" className="event-card" onClick={onOpen}><span className="event-time">{formatTime(event.start_at)}</span><div><div className="event-card-heading"><b>{EVENT_LABELS[event.event_type]}</b><Pill tone="plum">{groupCode(event.groups)}</Pill></div><p>{event.methodology_tasks?.title ?? event.title ?? "Без навчального завдання"}</p><small><MapPin size={14} />{eventVenueLabel(event.venues?.name, event.venue_part, Boolean(event.venues?.parent_venue_id))}</small><TrainingRegisterBadge event={event} /></div></button>;
}

function Calendar({ month, events, onCreate, onEdit }: { month: Date; events: EventItem[]; onCreate: (date: string) => void; onEdit: (event: EventItem) => void }) {
  const cells = calendarCells(month);
  return <div className="calendar-wrap"><div className="calendar-weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((date, index) => {
    if (!date) return <div className="calendar-day empty" key={`empty-${index}`} />;
    const dateKey = plainDateKey(date);
    const dayEvents = events.filter((event) => kyivDateKey(event.start_at) === dateKey);
    const isToday = dateKey === kyivDateKey(new Date());
    return <div className={`calendar-day${isToday ? " today" : ""}`} key={dateKey}><div className="calendar-date-row"><span>{date.getDate()}</span><button type="button" className="calendar-plus" aria-label={`Додати подію ${formatDate(`${dateKey}T12:00:00Z`)}`} onClick={() => onCreate(dateKey)}><Plus /></button></div><div className="calendar-events">{dayEvents.map((event) => <button type="button" className={`calendar-event ${event.event_type}`} aria-label={`${EVENT_LABELS[event.event_type]} · ${groupCode(event.groups)} · ${formatTime(event.start_at)}`} title={`${groupCode(event.groups)} · ${EVENT_LABELS[event.event_type]}`} key={event.id} onClick={() => onEdit(event)}><b>{formatTime(event.start_at)}</b><span>{EVENT_LABELS[event.event_type]}</span><small>{groupCode(event.groups)}</small><TrainingRegisterBadge event={event} /></button>)}</div></div>;
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
  const footer = <div className="event-tracking-actions">
    <button type="button" className="primary-action" onClick={onAttendance}><Users size={18} />{registerActionLabel(event)}</button>
  </div>;
  return <Modal title={`${EVENT_LABELS[event.event_type]} · ${groupCode(event.groups)}`} onClose={onClose} footer={footer}><TrainingRegisterBadge event={event} /><div className="detail-list"><div><Clock3 /><span><b>{formatDateTime(event.start_at)}</b><small>{event.duration_minutes} хвилин · час за Києвом</small></span></div><div><MapPin /><span><b>{eventVenueLabel(event.venues?.name, event.venue_part, Boolean(event.venues?.parent_venue_id))}</b></span></div><div><FileText /><span><b>{event.groups?.group_kind === "goalkeeper" ? "Завдання заняття" : "Навчальне завдання"}</b><small>{event.methodology_tasks?.title ?? event.title ?? "Не вибрано"}</small></span></div></div>{event.notes && <div className="text-block"><h3>Уточнення тренера</h3><p>{event.notes}</p></div>}{event.organizational_need && <div className="text-block"><h3>Організаційні потреби</h3><p>{event.organizational_need}</p></div>}<div className="text-block"><h3>Матеріали</h3>{assets.length ? <div className="file-list">{assets.map((asset) => <button type="button" key={asset.id} onClick={() => void openPrivateFile(client, asset)}><Paperclip size={17} /><span>{asset.original_name}</span></button>)}</div> : <p className="muted">Документів немає.</p>}</div></Modal>;
}

function EventEditor({ client, profile, groups, initialGroupId, event, isCreating, initialDate, venues, tasks, onClose, onCreateSimilar, onSaved, onAttendance }: { client: SupabaseClient; profile: Profile; groups: GroupSummary[]; initialGroupId: string; event?: EventItem; isCreating: boolean; initialDate?: string; venues: Venue[]; tasks: MethodologyTask[]; onClose: () => void; onCreateSimilar: (event: EventItem) => void; onSaved: (message?: string) => void; onAttendance: (event: EventItem) => void }) {
  const [groupId, setGroupId] = useState(event?.group_id ?? initialGroupId);
  const group = groups.find((item) => item.id === groupId);
  const availableTasks = tasks.filter((task) => group?.age != null && task.age_from <= group.age && task.age_to >= group.age);
  const canEdit = Boolean(group) && (isCreating || profile.role === "admin" || event?.coach_id === profile.id);
  const [removal, setRemoval] = useState<"delete" | "cancel" | null>(null);
  const [eventType, setEventType] = useState<EventItem["event_type"]>(event?.event_type ?? "training");
  const [date, setDate] = useState(isCreating && initialDate ? initialDate : event ? toKyivDateInput(event.start_at) : toKyivDateInput(new Date()));
  const [time, setTime] = useState(event ? toKyivTimeInput(event.start_at) : "17:00");
  const [duration, setDuration] = useState(() => durationInput(event?.duration_minutes ?? 75));
  const [venueId, setVenueId] = useState(event?.venue_id ?? venues.find((venue) => !venue.parent_venue_id)?.id ?? "");
  const [venuePart, setVenuePart] = useState<VenuePart>(normalizeVenuePart(event?.venue_part));
  const [venueBlocked, setVenueBlocked] = useState(false);
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
  const [draftReady, setDraftReady] = useState(false);
  const [draftState, setDraftState] = useState<DraftState>("idle");
  const conflictNoticeRef = useRef<HTMLDivElement>(null);
  const isConflict = message?.startsWith("Конфлікт:") ?? false;
  const [eventDraftKey] = useState(() => draftKey(profile.id, `event:${!isCreating && event ? event.id : `new:${(event?.group_id ?? initialGroupId) || "group"}:${initialDate ?? date}`}`));
  const [initialDraft] = useState<EventDraft>(() => ({ groupId, eventType, date, time, duration, venueId, venuePart, taskId, title, notes, selectedNeeds, otherNeed, comment, needsSubstitute }));
  const currentDraft = useMemo<EventDraft>(() => ({ groupId, eventType, date, time, duration, venueId, venuePart, taskId, title, notes, selectedNeeds, otherNeed, comment, needsSubstitute }), [groupId, comment, date, duration, eventType, needsSubstitute, notes, otherNeed, selectedNeeds, taskId, time, title, venueId, venuePart]);
  const currentDraftSerialized = JSON.stringify(currentDraft);
  const initialDraftSerialized = JSON.stringify(initialDraft);

  const applyDraft = useCallback((value: EventDraft) => {
    if (isCreating && value.groupId !== undefined) setGroupId(groups.some((item) => item.id === value.groupId) ? value.groupId : "");
    setEventType(value.eventType);
    setDate(value.date);
    setTime(value.time);
    setDuration(durationInput(value.duration));
    setVenueId(value.venueId);
    setVenuePart(normalizeVenuePart(value.venuePart));
    setTaskId(value.taskId);
    setTitle(value.title);
    setNotes(value.notes);
    setSelectedNeeds(value.selectedNeeds);
    setOtherNeed(value.otherNeed);
    setComment(value.comment);
    setNeedsSubstitute(value.needsSubstitute);
  }, [groups, isCreating, setGroupId, setEventType, setDate, setTime, setDuration, setVenueId, setTaskId, setTitle, setNotes, setSelectedNeeds, setOtherNeed, setComment, setNeedsSubstitute]);

  const restoredDraftKey = useRef<string | null>(null);
  useEffect(() => {
    if (restoredDraftKey.current === eventDraftKey) return;
    restoredDraftKey.current = eventDraftKey;
    const local = readDraft<EventDraft>(eventDraftKey);
    if (local && JSON.stringify(local.value) !== initialDraftSerialized) {
      applyDraft(local.value);
      setDraftState("restored");
    }
    setDraftReady(true);
  }, [applyDraft, eventDraftKey, initialDraftSerialized]);

  useEffect(() => {
    if (!draftReady) return;
    if (currentDraftSerialized === initialDraftSerialized) {
      clearDraft(eventDraftKey);
      setDraftState("idle");
      return;
    }
    setDraftState((state) => state === "restored" ? state : "saving");
    const timer = window.setTimeout(() => {
      if (writeDraft(eventDraftKey, profile.id, currentDraft)) setDraftState((state) => state === "restored" ? state : "saved");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentDraft, currentDraftSerialized, draftReady, eventDraftKey, initialDraftSerialized, profile.id]);

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
    if (busy) return;
    if (venueBlocked) { setMessage("Конфлікт: обрана частина майданчика зайнята. Виберіть іншу частину або час."); return; }
    if (!group || !canEdit) { setMessage("Виберіть призначену вам групу та перевірте право редагування події."); return; }
    const minutes = durationMinutes(duration);
    if (minutes == null) { setMessage("Вкажіть цілу тривалість від 15 до 360 хвилин."); return; }
    setBusy(true); setMessage(null);
    const creating = isCreating || !event;
    const nextStart = combineKyivDateTime(date, time);
    const rescheduled = !creating && !!event && new Date(nextStart).getTime() !== new Date(event.start_at).getTime();
    const organizationalNeed = supportsOrganizationalNeeds(eventType) ? serializeOrganizationalNeeds(selectedNeeds, otherNeed) : "";
    const payload = {
      group_id: group.id,
      event_type: eventType,
      start_at: nextStart,
      duration_minutes: minutes,
      venue_id: venueId || null,
      venue_part: effectiveVenuePart(venues.find((venue) => venue.id === venueId), venuePart),
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
    clearDraft(eventDraftKey);
    setDraftState("idle");
    setBusy(false); onSaved();
  }

  function save(eventForm: FormEvent) {
    eventForm.preventDefault();
    void persist();
  }

  async function requestRemoval() {
    if (!event || !canEdit || busy) return;
    setBusy(true); setMessage(null);
    try {
      const result = await client.from("attendance_sessions").select("id").eq("event_id", event.id).maybeSingle();
      if (result.error) throw result.error;
      setRemoval(result.data ? "cancel" : "delete");
    } catch { setMessage("Не вдалося перевірити подію. Нічого не видалено; повторіть спробу."); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!event || !group || !canEdit || !removal || busy) return;
    setBusy(true); setMessage(null);
    try {
      const query = removal === "cancel"
        ? client.from("events").update({ status: "cancelled", updated_by: profile.id })
        : client.from("events").delete();
      const result = await query.eq("id", event.id).eq("group_id", event.group_id).select("id").single();
      if (result.error) {
        setRemoval(null);
        setMessage(result.error.code === "23503"
          ? "Для події вже збережено присутність. Натисніть «Прибрати з календаря» повторно, щоб підтвердити скасування зі збереженням історії."
          : "Подію не прибрано. Оновіть календар і перевірте, чи це ваша подія та чи маєте ви доступ до групи.");
        return;
      }
      if (result.data?.id !== event.id) throw new Error("Event change was not confirmed");
      clearDraft(eventDraftKey);
      onSaved(removal === "cancel" ? "Подію скасовано. Присутність та історія збережені." : "Подію видалено.");
    } catch { setMessage("Подію не прибрано. Перевірте з’єднання й повторіть спробу."); }
    finally { setBusy(false); }
  }

  if (removal && event) return <Modal title={removal === "cancel" ? "Скасувати подію?" : "Видалити подію?"} onClose={() => !busy && setRemoval(null)} footer={<><button type="button" className="secondary-action" disabled={busy} onClick={() => setRemoval(null)}>Залишити подію</button><button type="button" className="danger-action" disabled={busy} onClick={() => void remove()}>{busy ? "Виконується…" : removal === "cancel" ? "Підтвердити скасування" : "Підтвердити видалення"}</button></>}>
    <p><b>{group ? groupCode(group) : "Група"} · {EVENT_LABELS[event.event_type]}</b><br />{formatDateTime(event.start_at)}</p>
    <p>{removal === "cancel" ? "Подія зникне з активного календаря. Збережена присутність, матеріали та історія залишаться в застосунку." : "Подію буде видалено з календаря. Цю дію не можна скасувати."}</p>
    {message && <StatusMessage kind="error">{message}</StatusMessage>}
  </Modal>;

  const footer = <><button type="button" className="secondary-action" onClick={onClose}>Скасувати</button>{event && !isCreating && <button type="button" className="danger-action" onClick={() => void requestRemoval()} disabled={busy || !canEdit}><Trash2 size={17} />Прибрати з календаря</button>}{event && !isCreating && <button type="button" className="secondary-action" onClick={() => onCreateSimilar(event)} disabled={busy}><Repeat2 size={17} />Створити подібне</button>}<button form="event-form" className="primary-action" disabled={busy || !canEdit}>{busy ? "Збереження…" : isCreating ? "Створити подію" : "Зберегти зміни"}</button></>;
  return <Modal title={event && !isCreating ? `Редагування · ${group ? groupCode(group) : ""}` : `Нова подія · ${group ? groupCode(group) : ""}`} onClose={onClose} wide footer={footer}><form id="event-form" className="event-editor-form" onSubmit={save}><div className="span-2"><DraftStatus state={draftState} onClear={draftState !== "idle" ? () => { clearDraft(eventDraftKey); applyDraft(initialDraft); setDraftState("idle"); } : undefined} /></div>{message && <div ref={conflictNoticeRef} className={`span-2${isConflict ? " conflict-notice" : ""}`} tabIndex={isConflict ? -1 : undefined}><StatusMessage kind={isConflict ? "error" : "warning"}>{message}</StatusMessage></div>}{!isCreating && !canEdit && <StatusMessage kind="warning">Редагувати та прибирати цю подію може її тренер або адміністратор.</StatusMessage>}<fieldset className="form-grid event-editor-fields" disabled={busy || (!isCreating && !canEdit)}>{isCreating && <label className="span-2"><span>Група події</span><select value={groupId} required onChange={(e) => { setGroupId(e.target.value); setTaskId(""); setTitle(""); setFile(null); }}><option value="" disabled>Виберіть групу</option>{groups.map((item) => <option value={item.id} key={item.id}>{groupCode(item)}</option>)}</select></label>}<label><span>Тип події</span><select value={eventType} onChange={(e) => setEventType(e.target.value as EventItem["event_type"])}>{Object.entries(EVENT_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label><span>Дата</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label><label><span>Час (Київ)</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></label><label><span>Тривалість, хв</span><input type="text" inputMode="numeric" pattern="[0-9]+" value={duration} onChange={(e) => { if (/^\d*$/.test(e.target.value)) setDuration(durationInput(e.target.value)); }} onBlur={() => setDuration(durationInput(duration))} aria-label="Тривалість у хвилинах" required /><small className="field-hint">Цілі хвилини, від 15 до 360.</small></label><VenueBookingSelector client={client} venues={venues} venueId={venueId} part={venuePart} startAt={date && time ? combineKyivDateTime(date, time) : null} minutes={durationMinutes(duration)} excludeEventId={!isCreating ? event?.id : null} checkAvailability={isCreating || event?.status === "scheduled"} onVenueChange={(id) => { setVenueId(id); setVenuePart("whole"); }} onPartChange={setVenuePart} onBlockedChange={setVenueBlocked} />{eventType === "training" && <>{group?.group_kind === "goalkeeper" ? <label className="span-2"><span>Завдання заняття</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Наприклад, гра на виходах" /></label> : <label className="span-2"><span>Навчальне завдання</span><select aria-label="Навчальне завдання" value={taskId} onChange={(e) => setTaskId(e.target.value)}><option value="">Не вибрано</option>{availableTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select>{taskId && <small className="field-hint">Ця команда вже використовувала завдання {usageCount} разів.</small>}</label>}<label className="span-2"><span>Документ із вправами</span><input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" disabled={group?.group_kind !== "goalkeeper" && !taskId} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />{group?.group_kind !== "goalkeeper" && !taskId && <small className="field-hint">Спочатку виберіть навчальне завдання.</small>}</label></>}<label className="span-2"><span>Уточнення тренера</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></label>{supportsOrganizationalNeeds(eventType) && <fieldset className="span-2 organizational-needs"><legend>Організаційні потреби</legend><p>Позначте все, що потрібно підготувати для цієї події.</p><div className="checkbox-grid">{ORGANIZATIONAL_NEED_OPTIONS.map((option) => <label className="check-field" key={option}><input type="checkbox" checked={selectedNeeds.includes(option)} onChange={(input) => setSelectedNeeds((current) => input.target.checked ? [...current, option] : current.filter((item) => item !== option))} /><span>{option}</span></label>)}</div>{selectedNeeds.includes("Інше") && <label className="other-need"><span>Уточніть іншу потребу</span><input value={otherNeed} onChange={(input) => setOtherNeed(input.target.value)} required /></label>}</fieldset>}<label className="span-2"><span>Додатковий коментар</span><textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /></label><label className="check-field span-2"><input type="checkbox" checked={needsSubstitute} onChange={(e) => setNeedsSubstitute(e.target.checked)} /><span>Потрібна заміна тренера</span></label></fieldset>{event && !isCreating && <div className="span-2 event-tracking-actions"><TrainingRegisterBadge event={event} /><button type="button" className="primary-action" onClick={() => onAttendance(event)}><Users size={18} />{registerActionLabel(event)}</button></div>}</form></Modal>;
}

function AttendanceModal({ client, profile, event, onClose, onSaved }: { client: SupabaseClient; profile: Profile; event: EventItem; onClose: () => void; onSaved: (attendanceSynced: boolean) => void }) {
  const [players, setPlayers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [records, setRecords] = useState<Record<string, "present" | "absent">>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      client.from("players").select("id, full_name").eq("group_id", event.group_id).eq("is_active", true).order("full_name"),
      client.from("attendance_sessions").select("id, attendance_records(player_id, status)").eq("event_id", event.id).maybeSingle(),
    ]).then(([playerResult, sessionResult]) => {
      if (!active) return;
      const list = (playerResult.data ?? []) as Array<{ id: string; full_name: string }>;
      const existing = ((sessionResult.data as unknown as { attendance_records?: Array<{ player_id: string; status: "present" | "absent" }> } | null)?.attendance_records ?? []);
      const initial: Record<string, "present" | "absent"> = {};
      for (const player of list) {
        initial[player.id] = existing.find((item) => item.player_id === player.id)?.status ?? "present";
      }
      setPlayers(list);
      setRecords(initial);
      if (playerResult.error || sessionResult.error) {
        setMessage("Попередні відмітки завантажено не повністю. Перевірте список перед збереженням.");
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [client, event.group_id, event.id]);

  function markAllPresent() {
    setRecords(Object.fromEntries(players.map((player) => [player.id, "present"])));
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const item: AttendanceQueueItem = {
      idempotencyKey: crypto.randomUUID(),
      eventId: event.id,
      completedBy: profile.id,
      createdAt: new Date().toISOString(),
      records: players.map((player) => ({
        player_id: player.id,
        status: records[player.id] ?? "present",
        note: "",
      })),
    };
    if (!navigator.onLine) {
      try {
        await enqueueAttendance(item);
        setMessage("Збережено офлайн. Дані синхронізуються після відновлення мережі.");
        window.setTimeout(() => onSaved(false), 800);
      } catch {
        setMessage("Не вдалося створити офлайн-чергу. Не закривайте вікно та повторіть після відновлення мережі.");
      }
      setBusy(false);
      return;
    }
    try {
      await persistAttendance(client, item);
      setBusy(false);
      onSaved(true);
    } catch {
      try {
        await enqueueAttendance(item);
        setMessage("Сервер недоступний. Присутність безпечно додано до черги синхронізації.");
        window.setTimeout(() => onSaved(false), 1000);
      } catch {
        setMessage("Сервер і офлайн-черга недоступні. Дані залишилися на екрані — повторіть збереження після відновлення мережі.");
      }
      setBusy(false);
    }
  }

  const presentCount = Object.values(records).filter((status) => status === "present").length;
  const absentCount = Math.max(0, players.length - presentCount);

  return <Modal title={`Присутність · ${groupCode(event.groups)}`} onClose={onClose} wide footer={<><button className="secondary-action" type="button" onClick={onClose}>Скасувати</button><button className="primary-action" type="button" onClick={() => void save()} disabled={busy || loading}>{busy ? "Збереження…" : "Зберегти присутність"}</button></>}>
    {loading ? <LoadingState /> : players.length ? <div className="attendance-list">
      <div className="attendance-help">
        <div><b>Відмітьте кожного гравця</b><p>Присутність можна зберегти до початку, на початку або після події.</p></div>
        <div className="attendance-summary"><Pill tone="teal">{presentCount} присутні</Pill><Pill tone={absentCount ? "warning" : "neutral"}>{absentCount} відсутні</Pill></div>
        <button className="secondary-action small" type="button" onClick={markAllPresent}><Check size={16} />Усі присутні</button>
      </div>
      {players.map((player) => {
        const status = records[player.id] ?? "present";
        return <article className={`attendance-row ${status}`} key={player.id}>
          <div className="attendance-player-name"><b>{player.full_name}</b><small>{status === "present" ? "Присутній" : "Відсутній"}</small></div>
          <div className="attendance-status-choice" role="group" aria-label={`Присутність · ${player.full_name}`}>
            <button type="button" className={status === "present" ? "selected present" : ""} aria-pressed={status === "present"} onClick={() => setRecords((value) => ({ ...value, [player.id]: "present" }))}><Check size={16} />Присутній</button>
            <button type="button" className={status === "absent" ? "selected absent" : ""} aria-pressed={status === "absent"} onClick={() => setRecords((value) => ({ ...value, [player.id]: "absent" }))}>Відсутній</button>
          </div>
        </article>;
      })}
    </div> : <EmptyState title="У команді немає активних гравців" />}
    {message && <StatusMessage kind="warning">{message}</StatusMessage>}
  </Modal>;
}
