import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtraMembership } from "@/lib/domain/group-memberships";
import type { Player } from "@/lib/domain/types";

export interface MembershipLabel {
  group_id: string;
  code: string;
  is_primary: boolean;
  active_from: string;
  active_to: string | null;
}

/** Read one canonical player row per member, including additional goalkeeper membership. */
export async function loadGroupPlayers(client: SupabaseClient, groupId: string, selection: string, onDate?: string) {
  const roster = await client.rpc("group_player_ids", { p_group_id: groupId, p_on_date: onDate ?? null });
  if (roster.error) return { data: null, error: roster.error };
  const members = (roster.data ?? []) as Array<{ player_id: string; primary_group_code: string }>;
  const ids = [...new Set(members.map((member) => member.player_id))];
  if (!ids.length) return { data: [], error: null };
  const result = await client.from("players").select(selection).in("id", ids).eq("is_active", true).order("full_name");
  if (result.error) return { data: null, error: result.error };
  // A goalkeeper coach can read this player's primary group label without gaining
  // access to the primary team's full roster or calendar.
  const rows = (result.data ?? []) as unknown as Array<Record<string, unknown>>;
  return {
    data: rows.map((row) => selection.includes("groups(") && !row.groups
      ? { ...row, groups: { code: members.find((member) => member.player_id === row.id)?.primary_group_code ?? "—" } }
      : row),
    error: null,
  };
}

export async function groupPlayerIds(client: SupabaseClient, groupId: string) {
  const result = await client.rpc("group_player_ids", { p_group_id: groupId, p_on_date: null });
  if (result.error) throw result.error;
  return [...new Set(((result.data ?? []) as Array<{ player_id: string }>).map((row) => row.player_id))];
}

async function readRosterPages<T extends { id: string }>(
  read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; count: number | null; error: unknown }>,
) {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expected: number | undefined;
  do {
    const { data, count, error } = await read(rows.length, rows.length + 499);
    if (error || !Array.isArray(data) || count == null || !Number.isSafeInteger(count) || count < 0) {
      throw new Error("Не вдалося повністю завантажити склад груп.");
    }
    expected ??= count;
    if (expected !== count || rows.length + data.length > expected || (!data.length && rows.length < expected)) {
      throw new Error("Склад груп змінився під час завантаження. Повторіть спробу.");
    }
    for (const row of data as T[]) {
      if (!row.id || ids.has(row.id)) throw new Error("Не вдалося повністю завантажити склад груп.");
      ids.add(row.id);
      rows.push(row);
    }
  } while (rows.length < expected);
  return rows;
}

export function loadActiveRosterPlayers(client: SupabaseClient, selection: string) {
  return readRosterPages<Player>((from, to) => client.from("players").select(selection, { count: "exact" })
    .eq("is_active", true).order("id").range(from, to));
}

export function loadActiveRosterMemberships(client: SupabaseClient, groupIds: string[], day: string) {
  if (!groupIds.length) return Promise.resolve([]);
  return readRosterPages<ExtraMembership & { id: string }>((from, to) => client.from("player_group_memberships")
    .select("id, player_id, group_id, active_from, active_to", { count: "exact" })
    .in("group_id", groupIds).lte("active_from", day).or(`active_to.is.null,active_to.gt.${day}`)
    .order("id").range(from, to));
}
