import type { SupabaseClient } from "@supabase/supabase-js";
export type ContentDataset = "tasks" | "terminology";
export interface ContentVersion { id: string; updated_at: string }
export function contentVersions(rows: ContentVersion[]) {
  if (rows.some(row => !row.id || !row.updated_at)) throw new Error("Оновіть перелік перед пакетною дією.");
  return rows.map(({ id, updated_at }) => ({ id, updated_at }));
}
export async function readContentRows<T extends { id: string }>(client: SupabaseClient, dataset: ContentDataset): Promise<T[]> {
  const table = dataset === "tasks" ? "methodology_tasks" : "terminology_entries";
  const rows: T[] = []; const seen = new Set<string>(); let expected: number | undefined;
  for (;;) {
    const result = await client.from(table).select("*", { count: "exact" }).order("id").range(rows.length, rows.length + 499);
    if (result.error || !Array.isArray(result.data) || result.count == null) throw new Error("Не вдалося повністю завантажити перелік. Повторіть спробу.");
    expected ??= result.count;
    if (expected !== result.count || (!result.data.length && rows.length < expected)) throw new Error("Перелік змінився. Оновіть сторінку.");
    for (const row of result.data as T[]) {
      if (!row.id || seen.has(row.id)) throw new Error("Перелік змінився. Оновіть сторінку.");
      seen.add(row.id); rows.push(row);
    }
    if (rows.length === expected) return rows;
    if (rows.length > expected) throw new Error("Не вдалося перевірити кількість записів.");
  }
}
