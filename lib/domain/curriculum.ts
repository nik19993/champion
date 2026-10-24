import type { GroupSummary, MethodologyTask } from "./types";
import { groupAge } from "./seasons.ts";
export const TASK_SELECT = "id, phase, level, component, title, description, age_from, age_to, sort_order, is_active, audience, goalkeeper_stage, context";
export function taskLabel(task: Pick<MethodologyTask,"component"|"title"|"description">) {
  const title=task.title.trim();
  const element=task.component?.trim();
  const prefix=element && !title.startsWith(element+".") ? element+". " : "";
  const hint=task.description?.trim();
  return prefix+title+(hint ? " "+(hint.startsWith("(") ? hint : "("+hint+")") : "");
}
export function taskForGroup(task: MethodologyTask, group: GroupSummary | undefined) {
  if (!group || !task.is_active) return false;
  if (group.group_kind === "goalkeeper") {
    const stage=group.team_suffix ?? /([ABC])$/.exec(group.display_code ?? group.code)?.[1];
    return task.audience === "goalkeeper" && task.goalkeeper_stage === stage;
  }
  const age=groupAge(group);
  return age !== null && age !== 17 && (task.audience ?? "field") === "field" && task.age_from === age && task.age_to === age;
}
