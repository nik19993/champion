"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, LoadingState, Pill, StatusMessage } from "@/components/common/workspace-ui";
import { OFFLINE_MESSAGE, useAutomaticRefresh } from "@/lib/browser/use-automatic-refresh";
import {
  adminCalendarRange, calendarDayLabel, calendarEventCount, calendarEventsByDay, calendarMonthCells,
  calendarRangeLabel, filterCalendarEvents, shiftCalendarAnchor,
  type AdminCalendarEvent, type CalendarPeriod, type CalendarRange,
} from "@/lib/domain/admin-calendar";
import { EVENT_LABELS, formatTime, kyivDateKey } from "@/lib/domain/format";
import { groupCode } from "@/lib/domain/seasons";
import type { GroupSummary, Venue } from "@/lib/domain/types";
import { eventVenueLabel } from "@/lib/domain/venue-booking";
import { loadAdminCalendarEvents } from "@/lib/supabase/admin-calendar";

type FilterOption = { id: string; label: string };
type CalendarSelection = { anchor: string; day: string; period: CalendarPeriod };
type LoadedCalendar = CalendarRange & { events: AdminCalendarEvent[] | null; failed: boolean };

const PERIODS: Array<{ value: CalendarPeriod; label: string }> = [
  { value: "7", label: "7 днів" }, { value: "10", label: "10 днів" }, { value: "month", label: "Місяць" },
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const TYPES = Object.entries(EVENT_LABELS).map(([id, label]) => ({ id, label }));
const NO_EVENTS: AdminCalendarEvent[] = [];

function calendarFilterOptions(groups: GroupSummary[], events: AdminCalendarEvent[], catalog: Pick<Venue, "id" | "name">[]) {
  const groupOptions = new Map(groups.map((group) => [group.id, groupCode(group)]));
  const coaches = new Map<string, string>();
  const venues = new Map(catalog.map(({ id, name }) => [id, name]));
  for (const event of events) {
    if (!groupOptions.has(event.group_id)) groupOptions.set(event.group_id, groupCode(event.groups));
    if (event.coach?.full_name) coaches.set(event.coach_id, event.coach.full_name);
    if (event.substitute_coach_id && event.substitute?.full_name) coaches.set(event.substitute_coach_id, event.substitute.full_name);
    if (event.venue_id && event.venues?.name && !venues.has(event.venue_id)) venues.set(event.venue_id, event.venues.name);
  }
  const options = (entries: Map<string, string>) => [...entries].map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "uk-UA", { numeric: true }));
  return { groups: options(groupOptions), coaches: options(coaches), venues: options(venues) };
}

function CalendarFilter({ label, all, options, value, onChange }: {
  label: string; all: string; options: FilterOption[]; value: FilterOption | null; onChange: (value: FilterOption | null) => void;
}) {
  const choices = value && !options.some((option) => option.id === value.id) ? [...options, value] : options;
  return (
    <label className="compact-field">
      <span>{label}</span>
      <select value={value?.id ?? ""} onChange={(event) => onChange(choices.find((option) => option.id === event.target.value) ?? null)}>
        <option value="">{all}</option>
        {choices.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

function eventTone(event: AdminCalendarEvent) {
  if (event.status === "cancelled") return "cancelled";
  return event.event_type === "training" || event.event_type === "theory" ? event.event_type : "competition";
}

function CalendarEventRow({ event, onOpen }: { event: AdminCalendarEvent; onOpen: (id: string) => void }) {
  const coach = event.substitute?.full_name ? `${event.substitute.full_name} · заміна` : event.coach?.full_name ?? "Тренера не вказано";
  const venue = eventVenueLabel(event.venues?.name, event.venue_part, Boolean(event.venues?.parent_venue_id));
  return (
    <button className="admin-calendar-event" type="button" onClick={() => onOpen(event.id)}>
      <span className="admin-calendar-event-time">{formatTime(event.start_at)}–{formatTime(event.ends_at)}</span>
      <span className="admin-calendar-event-title">
        <i className={`admin-calendar-dot ${eventTone(event)}`} aria-hidden="true" />
        <b>{EVENT_LABELS[event.event_type]}</b>
        <Pill>{groupCode(event.groups)}</Pill>
        {event.status === "cancelled" ? <Pill tone="danger">Скасовано</Pill> : <>
          {event.status === "completed" && <Pill tone="success">Завершено</Pill>}
          {event.status === "scheduled" && event.needs_substitute && !event.substitute_coach_id && <Pill tone="warning">Потрібна заміна</Pill>}
        </>}
      </span>
      <span className="admin-calendar-event-meta"><span>{coach}</span><span>{venue}</span></span>
      <ChevronRight className="admin-calendar-event-arrow" size={17} aria-hidden="true" />
    </button>
  );
}

function CalendarDay({ day, events, today, onOpen }: { day: string; events: AdminCalendarEvent[]; today: string; onOpen: (id: string) => void }) {
  return (
    <section className="admin-calendar-day-list" aria-label={calendarDayLabel(day)}>
      <header>
        <h3>{calendarDayLabel(day)}{day === today && <small> · Сьогодні</small>}</h3>
        <span>{calendarEventCount(events.length)}</span>
      </header>
      {events.length ? events.map((event) => <CalendarEventRow key={event.id} event={event} onOpen={onOpen} />)
        : <p className="admin-calendar-empty-day">На цей день подій немає.</p>}
    </section>
  );
}

function CalendarMonth({ range, byDay, day, today, onSelect }: {
  range: CalendarRange; byDay: Map<string, AdminCalendarEvent[]>; day: string; today: string; onSelect: (day: string) => void;
}) {
  return (
    <div className="admin-calendar-month">
      <div className="admin-calendar-weekdays" aria-hidden="true">{WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
      <div className="admin-calendar-month-grid" role="group" aria-label="Дні місяця">
        {calendarMonthCells(range).map((key, index) => {
          if (!key) return <span key={`empty-${index}`} className="admin-calendar-month-blank" aria-hidden="true" />;
          const events = byDay.get(key) ?? NO_EVENTS;
          return (
            <button type="button" key={key} aria-pressed={key === day} aria-current={key === today ? "date" : undefined}
              aria-label={`${calendarDayLabel(key)}, ${calendarEventCount(events.length)}`} onClick={() => onSelect(key)}>
              <span className="admin-calendar-date">{Number(key.slice(-2))}</span>
              {events.slice(0, 2).map((event) => (
                <span key={event.id} className={`admin-calendar-preview ${eventTone(event)}`} aria-hidden="true">
                  <i className={`admin-calendar-dot ${eventTone(event)}`} /> <span>{formatTime(event.start_at)} · {groupCode(event.groups)}</span>
                </span>
              ))}
              {events.length > 2 && <span className="admin-calendar-more" aria-hidden="true">Ще {events.length - 2}</span>}
              {events.length > 0 && <span className="admin-calendar-mobile-count" aria-hidden="true">{events.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AdminCalendar({ client, groups, revision, onOpenEvent }: {
  client: SupabaseClient; groups: GroupSummary[]; revision: number; onOpenEvent: (id: string) => void;
}) {
  const [selection, setSelection] = useState<CalendarSelection>(() => {
    const today = kyivDateKey(new Date());
    return { anchor: today, day: today, period: "7" };
  });
  const [loaded, setLoaded] = useState<LoadedCalendar | null>(null);
  const [venueCatalog, setVenueCatalog] = useState<Pick<Venue, "id" | "name">[]>([]);
  const [group, setGroup] = useState<FilterOption | null>(null);
  const [coach, setCoach] = useState<FilterOption | null>(null);
  const [type, setType] = useState<FilterOption | null>(null);
  const [venue, setVenue] = useState<FilterOption | null>(null);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const request = useRef(0);
  const dayDetails = useRef<HTMLDivElement>(null);
  const today = kyivDateKey(new Date());
  const { period, anchor, day } = selection;
  const { start, end } = adminCalendarRange(anchor, period);
  const current = loaded?.start === start && loaded.end === end ? loaded : null;
  const events = current?.events ?? NO_EVENTS;
  const options = useMemo(() => calendarFilterOptions(groups, events, venueCatalog), [groups, events, venueCatalog]);
  const visible = useMemo(() => filterCalendarEvents(events, {
    groupId: group?.id ?? "", coachId: coach?.id ?? "", type: type?.id ?? "", venueId: venue?.id ?? "", includeCancelled,
  }), [events, group, coach, type, venue, includeCancelled]);
  const byDay = useMemo(() => calendarEventsByDay(visible), [visible]);

  const load = useCallback(async () => {
    const ticket = ++request.current;
    const [eventResult, venueResult] = await Promise.allSettled([
      loadAdminCalendarEvents(client, { start, end }),
      client.from("venues").select("id,name").eq("is_active", true).is("parent_venue_id", null).neq("venue_type", "away"),
    ]);
    if (ticket !== request.current) return;
    if (venueResult.status === "fulfilled" && !venueResult.value.error && Array.isArray(venueResult.value.data)) {
      setVenueCatalog(venueResult.value.data);
    }
    if (eventResult.status === "fulfilled") {
      setLoaded({ start, end, events: eventResult.value, failed: false });
    } else {
      setLoaded((previous) => ({
        start, end, failed: true, events: previous?.start === start && previous.end === end ? previous.events : null,
      }));
    }
  }, [client, start, end]);

  useEffect(() => {
    const tickets = request;
    void load();
    return () => { tickets.current++; };
  }, [load, revision]);
  const online = useAutomaticRefresh(load);

  function selectPeriod(next: CalendarPeriod) {
    if (next === period) return;
    const nextAnchor = period === "month" ? day : anchor;
    setSelection({ anchor: nextAnchor, day: nextAnchor, period: next });
  }

  function move(direction: -1 | 1) {
    const next = shiftCalendarAnchor(anchor, period, direction);
    setSelection({ anchor: next, day: next, period });
  }

  function selectDay(next: string) {
    setSelection((previous) => ({ ...previous, day: next }));
    window.requestAnimationFrame(() => dayDetails.current?.scrollIntoView({ block: "nearest" }));
  }

  return (
    <section className="panel-section admin-calendar" aria-label="Календар подій клубу">
      <div className="admin-calendar-toolbar">
        <div className="subtabs admin-calendar-period" role="group" aria-label="Період календаря">
          {PERIODS.map((item) => <button type="button" key={item.value} className={item.value === period ? "active" : ""} aria-pressed={item.value === period} onClick={() => selectPeriod(item.value)}>{item.label}</button>)}
        </div>
        <div className="admin-calendar-navigation" role="group" aria-label="Навігація за датами">
          <button className="secondary-action small" type="button" aria-label="Попередній період" onClick={() => move(-1)}><ChevronLeft size={17} aria-hidden="true" /></button>
          <strong aria-live="polite">{calendarRangeLabel({ start, end }, period)}</strong>
          <button className="secondary-action small" type="button" aria-label="Наступний період" onClick={() => move(1)}><ChevronRight size={17} aria-hidden="true" /></button>
          <button className="secondary-action small" type="button" onClick={() => setSelection({ anchor: today, day: today, period })}>Сьогодні</button>
        </div>
      </div>
      <div className="admin-calendar-filters">
        <CalendarFilter label="Група" all="Усі групи" options={options.groups} value={group} onChange={setGroup} />
        <CalendarFilter label="Тренер" all="Усі тренери" options={options.coaches} value={coach} onChange={setCoach} />
        <CalendarFilter label="Тип події" all="Усі типи" options={TYPES} value={type} onChange={setType} />
        <CalendarFilter label="Майданчик" all="Усі майданчики" options={options.venues} value={venue} onChange={setVenue} />
      </div>
      <div className="admin-calendar-count">
        <span>{current?.events && <b aria-live="polite">{calendarEventCount(visible.length)} · </b>}Час за Києвом</span>
        <label className="check-field"><input type="checkbox" checked={includeCancelled} onChange={(event) => setIncludeCancelled(event.target.checked)} />Показати скасовані</label>
      </div>
      {!online && <p className="muted" role="status">{OFFLINE_MESSAGE}</p>}
      {current?.failed && <div className="admin-calendar-error">
        <StatusMessage kind={current.events ? "warning" : "error"}>{current.events ? "Не вдалося оновити календар. Показано попередні дані." : "Не вдалося завантажити календар подій."}</StatusMessage>
        <button className="secondary-action small" type="button" onClick={() => void load()}>Повторити</button>
      </div>}
      {!current ? <LoadingState label="Завантажуємо календар подій…" /> : current.events && (period === "month" ? <>
        <CalendarMonth range={{ start, end }} byDay={byDay} day={day} today={today} onSelect={selectDay} />
        <div className="admin-calendar-agenda" ref={dayDetails}><CalendarDay day={day} events={byDay.get(day) ?? NO_EVENTS} today={today} onOpen={onOpenEvent} /></div>
      </> : visible.length ? (
        <div className="admin-calendar-agenda">{[...byDay].map(([key, rows]) => <CalendarDay key={key} day={key} events={rows} today={today} onOpen={onOpenEvent} />)}</div>
      ) : <EmptyState title="За вибраний період подій немає" />)}
    </section>
  );
}
