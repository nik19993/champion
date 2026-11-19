import type { EventItem, GroupSummary, MethodologyTask } from "./types";
import { groupAge } from "./seasons.ts";
export const TASK_SELECT = "id, phase, level, component, title, description, age_from, age_to, sort_order, is_active, audience, goalkeeper_stage, context";
export function taskLabel(task: Pick<MethodologyTask,"component"|"title"|"description">) {
  const title=task.title.trim();
  const element=task.component?.trim();
  const prefix=element && !title.startsWith(element+".") ? element+". " : "";
  const hint=task.description?.trim();
  return prefix+title+(hint ? " "+(hint.startsWith("(") ? hint : "("+hint+")") : "");
}
export function taskForGroup(
  task: MethodologyTask,
  group: GroupSummary | undefined,
  use: "program" | "planning" = "program",
) {
  if (!group || !task.is_active) return false;
  if (group.group_kind === "goalkeeper") {
    const stage=group.team_suffix ?? /([ABC])$/.exec(group.display_code ?? group.code)?.[1];
    return task.audience === "goalkeeper" && task.goalkeeper_stage === stage;
  }
  const age = groupAge(group);
  if (age === null || (task.audience ?? "field") !== "field" || task.age_from !== task.age_to) return false;
  return task.age_from === age || (use === "planning" && age === 6 && task.age_from === 7);
}

type RetainedEventTask = { id: string; label: string } | { id: null; label: string };

export function retainedEventTask(event: EventItem | undefined, group: GroupSummary | undefined): RetainedEventTask | null {
  if (!event || !group || group.group_kind === "goalkeeper" || event.group_id !== group.id || event.event_type !== "training") return null;
  if (event.task_id) {
    const label = event.methodology_tasks ? taskLabel(event.methodology_tasks) : event.title?.trim();
    return { id: event.task_id, label: label || "Раніше вибране завдання" };
  }
  if (event.title?.trim()) return { id: null, label: event.title };
  return null;
}
