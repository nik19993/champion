export function normalizeBirthDate(value: string) {
  const raw = value.trim();
  const local = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(raw);
  const normalized = local ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}` : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === normalized ? normalized : null;
}

export function isMissingResult(value: string | null | undefined) {
  return !value?.trim() || /^[—–-]$/.test(value.trim());
}

export const PLAYER_IMPORT_FIELDS = ["birth_date", "birth_year", "position", "dominant_foot"] as const;

export function planPlayerCompletion(existing: Record<string, unknown>, incoming: Record<string, string>) {
  const updates: Record<string, string> = {};
  const conflicts: string[] = [];
  for (const field of PLAYER_IMPORT_FIELDS) {
    const next = incoming[field]?.trim();
    if (!next) continue;
    const previous = existing[field];
    if (previous == null || String(previous).trim() === "") updates[field] = next;
    else if (String(previous).trim() !== next) conflicts.push(field);
  }
  return { updates, conflicts };
}
