import type { OperationalItem } from "./types.ts";

export function eventIsVisible(event: { status?: string; coach_comment?: string | null }) {
  return event.status !== "cancelled" || Boolean(event.coach_comment?.trim());
}

export function operationalItemIsVisible(item: Pick<OperationalItem, "item_type" | "comment" | "events">) {
  if (item.item_type === "conflict" || item.item_type === "reschedule") return false;
  const event = Array.isArray(item.events) ? item.events[0] : item.events;
  if (event?.status === "cancelled") {
    return item.item_type === "comment" && Boolean(item.comment?.trim() || event.coach_comment?.trim());
  }
  return true;
}
