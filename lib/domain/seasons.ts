export interface SeasonGroup {
  id?: string;
  code: string;
  age?: number | null;
  team_suffix?: string | null;
  group_kind?: string;
  display_code?: string | null;
  display_age?: number | null;
  cohort_birth_year?: number | null;
  season?: string | null;
}

export function seasonName(startYear: number) {
  return `${startYear}/${startYear + 1}`;
}

export function parseSeason(value: string | null | undefined): number | null {
  const match = /^(20\d{2})\/(20\d{2})$/.exec(value ?? "");
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return null;
  return Number(match[1]);
}

export function groupCode(group: SeasonGroup | SeasonGroup[] | null | undefined) {
  const item = Array.isArray(group) ? group[0] : group;
  return item?.display_code ?? item?.code ?? "—";
}

export function groupAge(group: SeasonGroup | SeasonGroup[] | null | undefined) {
  const item = Array.isArray(group) ? group[0] : group;
  if (!item || item.group_kind === "goalkeeper") return null;
  return item.display_age ?? item.age ?? null;
}

export function groupLabel(group: SeasonGroup) {
  const code = groupCode(group);
  return group.cohort_birth_year ? `${code} · ${group.cohort_birth_year}` : code;
}

export function previewSeason(groups: SeasonGroup[], startYear: number) {
  return groups.filter((group) => group.group_kind === "age").map((group) => {
    const birthYear = group.cohort_birth_year;
    const age = birthYear == null ? null : startYear + 1 - birthYear;
    return {
      id: group.id,
      previous: groupCode(group),
      next: age == null ? null : `U${age}${group.team_suffix ?? ""}`,
      birthYear,
      age,
    };
  });
}
