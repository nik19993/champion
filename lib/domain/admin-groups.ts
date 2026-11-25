import type { GroupSummary, Player } from "./types.ts";
import { uniqueRosterCount, type ExtraMembership } from "./group-memberships.ts";

export const ADMIN_GROUP_SECTIONS = [
  { value: "main", label: "Основні групи", kind: "age" },
  { value: "location", label: "Групи локацій", kind: "location" },
  { value: "goalkeeper", label: "Групи воротарів", kind: "goalkeeper" },
] as const;
export type AdminGroupSection = typeof ADMIN_GROUP_SECTIONS[number]["value"];

export function groupsForAdminSection<T extends Pick<GroupSummary, "group_kind">>(groups: T[], section: AdminGroupSection) {
  const kind = ADMIN_GROUP_SECTIONS.find((item) => item.value === section)?.kind;
  return kind ? groups.filter((group) => group.group_kind === kind) : [];
}

export function adminGroupPlayerCounts(
  groups: Array<Pick<GroupSummary, "id" | "group_kind">>,
  players: Array<Pick<Player, "id" | "group_id" | "is_active">> | null,
  memberships: ExtraMembership[] | null,
  day: string,
) {
  const active = players?.filter((player) => player.is_active) ?? null;
  const sections = Object.fromEntries(ADMIN_GROUP_SECTIONS.map(({ value }) => [value,
    active && memberships ? uniqueRosterCount(groupsForAdminSection(groups, value).map((group) => group.id), active, memberships, day) : null,
  ])) as Record<AdminGroupSection, number | null>;
  return { total: active ? new Set(active.map((player) => player.id)).size : null, sections };
}

export function playerCountLabel(count: number | null) {
  if (count === null) return "— гравців";
  const lastTwo = count % 100, last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "гравців" : last === 1 ? "гравець" : last >= 2 && last <= 4 ? "гравці" : "гравців";
  return `${count} ${noun}`;
}

export interface GroupDeletionStatus {
  id: string;
  code: string;
  is_active: boolean;
  player_count: number;
  future_event_count: number;
  weekly_slot_count: number;
}

export function parseGroupDeletionStatus(value: unknown, groupId: string): GroupDeletionStatus {
  const row = value as GroupDeletionStatus | null;
  if (!row || row.id !== groupId || typeof row.code !== "string" || typeof row.is_active !== "boolean"
    || ![row.player_count, row.future_event_count, row.weekly_slot_count].every((count) => Number.isSafeInteger(count) && count >= 0)) {
    throw new Error("INVALID_GROUP_DELETION_STATUS");
  }
  return row;
}

export function groupDeletionBlocker(state: GroupDeletionStatus) {
  if (state.player_count > 0) return "У групі є гравці або заплановане зарахування. Спочатку переведіть чи відрахуйте їх.";
  if (state.future_event_count > 0) return "Група має майбутні або поточні заняття. Спочатку перенесіть чи скасуйте їх у календарі.";
  if (state.weekly_slot_count > 0) return "Група має записи в розкладі занять. Спочатку приберіть або змініть ці записи.";
  return null;
}

export function groupDeletionError(error: unknown) {
  const details = error as { code?: string; message?: string };
  if (details?.message?.includes("GROUP_HAS_PLAYERS")) return "Склад групи змінився: у ній є гравці. Оновіть дані.";
  if (details?.message?.includes("GROUP_HAS_FUTURE_EVENTS")) return "З’явилися майбутні або поточні заняття. Спочатку перенесіть чи скасуйте їх.";
  if (details?.message?.includes("GROUP_HAS_WEEKLY_SCHEDULE")) return "Група має записи в розкладі занять. Спочатку приберіть або змініть їх.";
  if (details?.code === "42501") return "Потрібна двоетапна перевірка адміністратора. Підтвердьте вхід і повторіть дію.";
  if (["55P03", "40P01", "40001"].includes(details?.code ?? "")) return "Дані змінюються іншим запитом. Перевірте стан і повторіть дію.";
  return "Не вдалося підтвердити результат. Перевірте стан групи; повторна спроба не видалить історію.";
}
