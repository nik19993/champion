import { eventVenueLabel } from "./venue-booking.ts";
import type { OperationalItem } from "./types";
import { EVENT_LABELS, OPERATIONAL_STATUS_LABELS } from "./format.ts";
import { groupLabel } from "./seasons.ts";

// Explicit foreign keys avoid ambiguity; all context comes from one query.
export const OPERATIONAL_REPORT_SELECT = "id, group_id, event_id, item_type, status, title, comment, due_at, created_at, groups(code, display_code, cohort_birth_year, season), creator:profiles!operational_items_created_by_fkey(full_name, role), events(start_at, event_type, venue_part, title, coach_comment, organizational_need, status, venues(name, parent_venue_id), methodology_tasks(title), coach:profiles!events_coach_id_fkey(full_name), substitute:profiles!events_substitute_coach_id_fkey(full_name))";

const reportDate = new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export function operationalReportRow(item: OperationalItem) {
  const event = firstRelation(item.events);
  const group = firstRelation(item.groups);
  const coach = firstRelation(event?.substitute) ?? firstRelation(event?.coach);
  const creator = firstRelation(item.creator);
  const coachName = coach?.full_name?.trim() || (creator?.role === "coach" ? creator.full_name?.trim() : "") || "Тренера не вказано";
  const comment = item.comment?.trim() || "";
  let action: string;
  if (item.item_type === "coach_substitution") {
    action = ["Знайти та призначити тренера на заміну.", comment].filter(Boolean).join("\n");
  } else if (item.item_type === "organizational_need") {
    const need = comment || event?.organizational_need?.trim();
    action = need ? `Підготувати: ${need}` : "Конкретні організаційні потреби не вказано.";
  } else if (item.item_type === "comment") {
    action = comment || event?.coach_comment?.trim() || "Конкретний коментар не вказано.";
  } else {
    action = [item.title?.trim(), comment].filter(Boolean).join("\n") || "Конкретну дію не вказано.";
  }
  const task = firstRelation(event?.methodology_tasks);
  const venue = firstRelation(event?.venues);
  const context = event ? [EVENT_LABELS[event.event_type] ?? "Подія", task?.title || event.title, venue?.name ? eventVenueLabel(venue.name, event.venue_part, Boolean(venue.parent_venue_id)) : null, event.status === "cancelled" ? "Скасовано" : null].filter(Boolean).join(" · ") : "Подію не прив’язано";
  return {
    date: reportDate.format(new Date(event?.start_at ?? item.due_at ?? item.created_at)),
    group: group ? groupLabel(group) : "Групу не вказано",
    coach: coachName,
    action,
    context,
    status: OPERATIONAL_STATUS_LABELS[item.status],
  };
}
