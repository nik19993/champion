import { kyivDateKey } from "./format.ts";
import { eventIsVisible } from "./event-visibility.ts";
import type { EventItem, GroupSummary } from "./types.ts";

export type CalendarPeriod = "7" | "10" | "month";
export type AdminCalendarScope = "main" | "locations";
export interface CalendarRange { start: string; end: string }

export interface AdminCalendarEvent extends Pick<EventItem, "id" | "group_id" | "event_type" | "start_at" | "venue_id" | "venue_part" | "coach_id" | "substitute_coach_id" | "needs_substitute" | "is_rescheduled" | "status" | "groups" | "venues"> {
  ends_at: string;
  booking_venue_id: string | null;
  coach_comment?: string | null;
  coach: { full_name: string } | null;
  substitute: { full_name: string } | null;
}

export interface AdminCalendarFilters {
  groupId: string;
  coachId: string;
  type: string;
  venueId: string;
  includeCancelled: boolean;
}

const dayMs = 86_400_000;
const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const dayFormatter = new Intl.DateTimeFormat("uk-UA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const shortFormatter = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", timeZone: "UTC" });
const monthFormatter = new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric", timeZone: "UTC" });
const plural = new Intl.PluralRules("uk-UA");

function addDays(day: string, days: number) {
  return dayKey(new Date(dateOf(day).getTime() + days * dayMs));
}

function monthStart(day: string, offset = 0) {
  const date = dateOf(day);
  return dayKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)));
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("uk-UA") + value.slice(1);
}

export function adminCalendarRange(anchor: string, period: CalendarPeriod): CalendarRange {
  return period === "month"
    ? { start: monthStart(anchor), end: monthStart(anchor, 1) }
    : { start: anchor, end: addDays(anchor, Number(period)) };
}

export function shiftCalendarAnchor(anchor: string, period: CalendarPeriod, direction: -1 | 1) {
  return period === "month" ? monthStart(anchor, direction) : addDays(anchor, Number(period) * direction);
}

export function calendarRangeLabel(range: CalendarRange, period: CalendarPeriod) {
  if (period === "month") return capitalize(monthFormatter.format(dateOf(range.start)));
  const last = addDays(range.end, -1);
  const lastDate = dateOf(last);
  if (range.start.slice(0, 7) === last.slice(0, 7)) {
    return `${dateOf(range.start).getUTCDate()}–${shortFormatter.format(lastDate)} ${lastDate.getUTCFullYear()}`;
  }
  const first = dateOf(range.start);
  const firstYear = first.getUTCFullYear() === lastDate.getUTCFullYear() ? "" : ` ${first.getUTCFullYear()}`;
  return `${shortFormatter.format(first)}${firstYear} – ${shortFormatter.format(lastDate)} ${lastDate.getUTCFullYear()}`;
}

export function calendarDayLabel(day: string) {
  return capitalize(dayFormatter.format(dateOf(day)));
}

export function calendarEventCount(count: number) {
  const form = plural.select(count);
  return `${count} ${form === "one" ? "подія" : form === "few" ? "події" : "подій"}`;
}

export function calendarMonthCells(range: CalendarRange) {
  const start = dateOf(range.start);
  const leading = (start.getUTCDay() + 6) % 7;
  const count = Math.round((dateOf(range.end).getTime() - start.getTime()) / dayMs);
  return Array.from({ length: Math.ceil((leading + count) / 7) * 7 }, (_, index) => {
    const offset = index - leading;
    return offset >= 0 && offset < count ? addDays(range.start, offset) : null;
  });
}

export function filterCalendarEvents(events: AdminCalendarEvent[], filters: AdminCalendarFilters) {
  return events.filter((event) => (
    eventIsVisible(event) && (filters.includeCancelled || event.status !== "cancelled")
    && (!filters.groupId || event.group_id === filters.groupId)
    && (!filters.coachId || event.coach_id === filters.coachId || event.substitute_coach_id === filters.coachId)
    && (!filters.type || event.event_type === filters.type)
    && (!filters.venueId || event.venue_id === filters.venueId || event.booking_venue_id === filters.venueId)
  ));
}

export function calendarEventsForScope(events: AdminCalendarEvent[], scope: AdminCalendarScope, groups: GroupSummary[] = []) {
  const kinds = new Map(groups.map(group => [group.id, group.group_kind]));
  return events.filter(event => {
    // Joined kind also covers historical groups absent from the active catalog.
    const location = (event.groups?.group_kind ?? kinds.get(event.group_id)) === "location";
    return scope === "locations" ? location : !location;
  });
}

export function calendarEventsByDay(events: AdminCalendarEvent[]) {
  const byDay = new Map<string, AdminCalendarEvent[]>();
  for (const event of [...events].sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at) || a.id.localeCompare(b.id))) {
    const day = kyivDateKey(event.start_at);
    const list = byDay.get(day);
    if (list) list.push(event);
    else byDay.set(day, [event]);
  }
  return byDay;
}
