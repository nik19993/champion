import { eventVenueLabel, normalizeVenuePart, VENUE_PART_LABELS, venueDisplayRank, venuePartsOverlap, type VenuePart } from "./venue-booking.ts";

export const WEEKDAYS = ["Понеділок", "Вівторок", "Середа", "Четвер", "П’ятниця", "Субота", "Неділя"] as const;

export interface ScheduleSlotValues {
  weekday: number;
  start_time: string;
  end_time: string;
  group_id: string;
  coach_id: string | null;
  venue_id: string | null;
  venue_part: VenuePart;
}

export interface ScheduleSlot extends ScheduleSlotValues {
  id: string;
  group_code: string;
  coach_name: string | null;
  venue_name: string | null;
  booking_venue_id: string | null;
  booking_venue_name: string | null;
}

export function slotTime(time: string) {
  return time.slice(0, 5);
}

export function slotTimeRange(slot: ScheduleSlotValues) {
  return `${slotTime(slot.start_time)}–${slotTime(slot.end_time)}`;
}

export function slotVenueLabel(slot: ScheduleSlot) {
  return eventVenueLabel(slot.booking_venue_name ?? slot.venue_name, slot.venue_part);
}

const SCHEDULE_VENUE_NAMES = new Map([
  ["Спортивний зал Політехнік", "Спортивний зал «Політехнік»"],
  ["Зал ЗОШ 26", "Спортивний зал ЗОШ №26"],
  ["Стадіон с.Буричівка", "Стадіон у Буричівці"],
]);

function scheduleVenueName(slot: ScheduleSlot) {
  return slot.booking_venue_name?.trim() || slot.venue_name?.trim() || "";
}

export function groupScheduleByVenue(slots: ScheduleSlot[]) {
  const groups = new Map<string | null, { id: string | null; name: string; slots: ScheduleSlot[] }>();
  for (const slot of slots) {
    const id = slot.booking_venue_id ?? slot.venue_id;
    const group = groups.get(id);
    if (group) group.slots.push(slot);
    else groups.set(id, { id, name: scheduleVenueName(slot), slots: [slot] });
  }

  return [...groups.values()]
    .sort((a, b) => Number(a.id === null) - Number(b.id === null)
      || venueDisplayRank(a.name) - venueDisplayRank(b.name)
      || a.name.localeCompare(b.name, "uk", { numeric: true }))
    .map(({ id, name, slots }) => ({
      id,
      name: SCHEDULE_VENUE_NAMES.get(name) ?? (name || "Майданчик не вказано"),
      slots: slots.sort((a, b) => a.weekday - b.weekday
        || a.start_time.localeCompare(b.start_time)
        || a.end_time.localeCompare(b.end_time)
        || a.group_code.localeCompare(b.group_code, "uk", { numeric: true })),
    }));
}

export function groupScheduleByDay(slots: ScheduleSlot[], selectedDay?: number) {
  return WEEKDAYS.flatMap((label, index) => {
    const weekday = index + 1;
    if (selectedDay !== undefined && selectedDay !== weekday) return [];
    const venues = groupScheduleByVenue(slots.filter((slot) => slot.weekday === weekday));
    return [{ weekday, label, venues }];
  });
}

export function scheduleVenuePartLabel(slot: ScheduleSlot) {
  const name = scheduleVenueName(slot).toLocaleLowerCase("uk");
  if (!name || name === "виїзд") return "—";
  const part = normalizeVenuePart(slot.venue_part);
  if (part !== "whole") return VENUE_PART_LABELS[part];
  return /(^|\s)(?:спорт)?зал(?:\s|$)/u.test(name) ? "Увесь зал" : "Усе поле";
}

export function scheduleCoachLabel(fullName: string | null) {
  // The schedule RPC returns coach names in surname, first name, patronymic order.
  const [surname, firstName] = fullName?.trim().split(/\s+/u) ?? [];
  if (!surname) return "Тренера не вказано";
  if (surname.toLocaleLowerCase("uk") === "андрієшин" && firstName) {
    return `${surname} ${firstName.charAt(0).toLocaleUpperCase("uk")}.`;
  }
  return surname;
}

export function sameScheduleSlot(a: ScheduleSlotValues, b: ScheduleSlotValues) {
  return a.weekday === b.weekday && slotTime(a.start_time) === slotTime(b.start_time)
    && slotTime(a.end_time) === slotTime(b.end_time) && a.group_id === b.group_id
    && a.coach_id === b.coach_id && a.venue_id === b.venue_id && a.venue_part === b.venue_part;
}

export function scheduleConflicts(
  candidate: ScheduleSlotValues & { booking_venue_id: string | null },
  slots: ScheduleSlot[],
  excludeId?: string,
) {
  const start = slotTime(candidate.start_time);
  const end = slotTime(candidate.end_time);
  if (!start || !end || start >= end) return [];

  return slots.flatMap((slot) => {
    if (slot.id === excludeId || slot.weekday !== candidate.weekday
      || slotTime(slot.start_time) >= end || slotTime(slot.end_time) <= start) return [];

    const reasons: string[] = [];
    if (candidate.group_id === slot.group_id) reasons.push("група");
    if (candidate.coach_id && candidate.coach_id === slot.coach_id) reasons.push("тренер");
    if (candidate.booking_venue_id && candidate.booking_venue_id === slot.booking_venue_id
      && venuePartsOverlap(candidate.venue_part, slot.venue_part)) reasons.push("майданчик");
    return reasons.length ? [{ slot, reasons }] : [];
  });
}
