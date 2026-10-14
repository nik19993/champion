import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types.ts";

type TableName = keyof Database["public"]["Tables"];
type BackupTable = { name: TableName; key: readonly string[] };

// Primary-key ordering is required: range pagination without it can skip records.
export const APPLICATION_BACKUP_TABLES = [
  { name: "announcement_reads", key: ["announcement_id", "profile_id"] },
  { name: "announcement_targets", key: ["id"] },
  { name: "announcements", key: ["id"] },
  { name: "attendance_records", key: ["id"] },
  { name: "attendance_sessions", key: ["id"] },
  { name: "audit_log", key: ["id"] },
  { name: "club_season_settings", key: ["id"] },
  { name: "coach_group_assignments", key: ["id"] },
  { name: "evaluation_metric_fields", key: ["id"] },
  { name: "evaluation_metrics", key: ["id"] },
  { name: "event_materials", key: ["id"] },
  { name: "events", key: ["id"] },
  { name: "export_jobs", key: ["id"] },
  { name: "file_assets", key: ["id"] },
  { name: "game_activity_results", key: ["id"] },
  { name: "group_season_history", key: ["group_id", "start_year"] },
  { name: "groups", key: ["id"] },
  { name: "guardians", key: ["id"] },
  { name: "import_jobs", key: ["id"] },
  { name: "import_rows", key: ["id"] },
  { name: "inventory_adjustments", key: ["id"] },
  { name: "inventory_items", key: ["id"] },
  { name: "inventory_permissions", key: ["id"] },
  { name: "methodology_materials", key: ["id"] },
  { name: "methodology_section_materials", key: ["id"] },
  { name: "methodology_sections", key: ["id"] },
  { name: "methodology_tasks", key: ["id"] },
  { name: "monthly_payments", key: ["id"] },
  { name: "monthly_star_awards", key: ["id"] },
  { name: "monthly_star_themes", key: ["id"] },
  { name: "operational_items", key: ["id"] },
  { name: "parent_contact_actions", key: ["id"] },
  { name: "physical_test_results", key: ["id"] },
  { name: "physical_test_sessions", key: ["id"] },
  { name: "player_behavior_cards", key: ["id"] },
  { name: "player_photos", key: ["id"] },
  { name: "players", key: ["id"] },
  { name: "profiles", key: ["id"] },
  { name: "terminology_entries", key: ["id"] },
  { name: "training_register_completions", key: ["event_id"] },
  { name: "training_structure_steps", key: ["id"] },
  { name: "training_structures", key: ["id"] },
  { name: "uniform_catalog_items", key: ["id"] },
  { name: "uniform_request_items", key: ["id"] },
  { name: "uniform_requests", key: ["id"] },
  { name: "venues", key: ["id"] },
] as const satisfies readonly BackupTable[];

async function assertBackupAdministrator(client: SupabaseClient, administratorId: string) {
  const user = await client.auth.getUser();
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (user.error || user.data.user?.id !== administratorId || assurance.error || assurance.data?.currentLevel !== "aal2") {
    throw new Error("Підтвердьте вхід адміністратора перед створенням резервної копії.");
  }
  const profile = await client.from("profiles").select("id, role, status").eq("id", administratorId).single();
  if (profile.error || profile.data?.role !== "admin" || profile.data?.status !== "active") {
    throw new Error("Немає доступу адміністратора до резервної копії.");
  }
}

export async function collectApplicationBackup(client: SupabaseClient, administratorId: string) {
  await assertBackupAdministrator(client, administratorId);
  const startedAt = new Date().toISOString();
  const data: Record<string, unknown> = {};
  const counts: Record<string, number> = {};
  for (const table of APPLICATION_BACKUP_TABLES) {
    const rows: Record<string, unknown>[] = [];
    const keys = new Set<string>();
    let expected: number | undefined;
    for (;;) {
      let query = client.from(table.name).select("*", { count: "exact" });
      for (const column of table.key) query = query.order(column, { ascending: true });
      const result = await query.range(rows.length, rows.length + 499);
      if (result.error || !Array.isArray(result.data) || result.count == null || !Number.isSafeInteger(result.count) || result.count < 0) {
        throw new Error(`Не вдалося повністю прочитати дані: ${table.name}. Файл не створено.`);
      }
      expected ??= result.count;
      if (expected !== result.count) throw new Error(`Дані змінилися під час копіювання: ${table.name}. Повторіть спробу.`);
      for (const row of result.data as Record<string, unknown>[]) {
        const values = table.key.map((column) => row[column]);
        if (values.some((value) => value == null)) throw new Error(`Неповний запис: ${table.name}. Файл не створено.`);
        const key = JSON.stringify(values);
        if (keys.has(key)) throw new Error(`Повторний запис під час копіювання: ${table.name}. Файл не створено.`);
        keys.add(key);
        rows.push(row);
      }
      if (rows.length > expected || (!result.data.length && rows.length < expected)) {
        throw new Error(`Кількість записів не збігається: ${table.name}. Файл не створено.`);
      }
      // A server can return less than 500 rows. Advance by the actual length.
      if (rows.length === expected) break;
    }
    const finalCount = await client.from(table.name).select("*", { count: "exact", head: true });
    if (finalCount.error || finalCount.count !== expected) throw new Error(`Дані змінилися під час копіювання: ${table.name}. Повторіть спробу.`);
    data[table.name] = rows;
    counts[table.name] = rows.length;
  }
  await assertBackupAdministrator(client, administratorId);
  return {
    ...data,
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    club: "Клуб Чемпіон",
    schema_version: "1.5",
    backup_scope: "application-tables",
    full_recovery_backup: false,
    row_counts: counts,
  };
}
