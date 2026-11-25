import type { GroupSummary } from "./types.ts";

export const LOCATION_CATEGORIES = {
  A: { min: 6, max: 8, label: "А · 6–8 років" },
  B: { min: 9, max: 12, label: "B · 9–12 років" },
  C: { min: 13, max: 17, label: "C · 13–17 років" },
} as const;
export type LocationCategory = keyof typeof LOCATION_CATEGORIES;

export interface ClubLocation {
  id: string;
  school_number: number;
  name: string;
  venue_id: string | null;
}

export const GROUP_SUMMARY_SELECT = "id, code, age, team_suffix, group_kind, competition_format, regulation_source, regulation_verified_on, season, cohort_birth_year, display_age, display_code, location_id, location:club_locations(id, school_number, name, venue_id)";

export function locationAgeRange(group: { group_kind?: string; team_suffix?: string | null } | undefined) {
  if (group?.group_kind !== "location") return null;
  const category = group.team_suffix as LocationCategory;
  return LOCATION_CATEGORIES[category] ?? null;
}

export function locationGroupCode(schoolNumber: number, category: string) {
  if (!Number.isInteger(schoolNumber) || schoolNumber < 1 || schoolNumber > 9999 || !Object.hasOwn(LOCATION_CATEGORIES, category)) return null;
  return `Локація № ${schoolNumber} ${category}`;
}

export function fixedTrainingVenue(group: { group_kind?: string; location?: ClubLocation | null } | null | undefined, eventType: string) {
  return group?.group_kind === "location" && eventType === "training" ? group.location?.venue_id ?? null : null;
}

export const ALL_GROUPS_SCOPE = "all";

export function groupsInScope(groups: GroupSummary[], scope: string) {
  if (scope === ALL_GROUPS_SCOPE) return groups;
  if (scope === "main") return groups.filter((group) => group.group_kind !== "location");
  if (scope === "locations") return groups.filter((group) => group.group_kind === "location");
  if (scope.startsWith("location:")) return groups.filter((group) => group.group_kind === "location" && group.location_id === scope.slice(9));
  if (scope.startsWith("group:")) return groups.filter((group) => group.id === scope.slice(6));
  return [];
}

export function groupScopeOptions(groups: GroupSummary[]) {
  const locations = new Map(groups.filter((group) => group.group_kind === "location" && group.location).map((group) => [group.location!.id, group.location!]));
  return [
    { value: ALL_GROUPS_SCOPE, label: "Увесь клуб" },
    { value: "main", label: "Основні групи" },
    { value: "locations", label: "Усі групи локацій" },
    ...[...locations.values()].sort((a, b) => a.school_number - b.school_number).map((location) => ({ value: `location:${location.id}`, label: `Локація № ${location.school_number} · ${location.name}` })),
    ...groups.map((group) => ({ value: `group:${group.id}`, label: group.display_code ?? group.code })),
  ];
}
