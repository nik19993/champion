import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGroupDeletionStatus } from "../domain/admin-groups.ts";

async function bounded<T>(work: (signal: AbortSignal) => PromiseLike<T>, milliseconds: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => work(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new Error("GROUP_DELETE_TIMEOUT")); controller.abort(); }, milliseconds);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

export function loadGroupDeletionStatus(client: SupabaseClient, groupId: string, timeoutMs = 10000) {
  return bounded(async (signal) => {
    const result = await client.rpc("empty_group_deletion_status", { p_group_id: groupId }).abortSignal(signal);
    if (result.error) throw result.error;
    return parseGroupDeletionStatus(result.data, groupId);
  }, timeoutMs);
}

export async function deleteEmptyGroup(client: SupabaseClient, groupId: string, options: { timeoutMs?: number; verifyTimeoutMs?: number } = {}) {
  try {
    await bounded(async (signal) => {
      const result = await client.rpc("delete_empty_group", { p_group_id: groupId }).abortSignal(signal);
      if (result.error) throw result.error;
      if (result.data?.id !== groupId || typeof result.data?.already_deleted !== "boolean") throw new Error("INVALID_DELETE_RESPONSE");
    }, options.timeoutMs ?? 15000);
  } catch (error) {
    const details = error as { code?: string };
    if (details.code && details.code !== "57014") throw error;
    // A missing response does not prove failure. Confirm without repeating a write.
    try {
      const state = await loadGroupDeletionStatus(client, groupId, options.verifyTimeoutMs ?? 5000);
      if (!state.is_active) return;
    } catch { /* An unreadable state remains an explicit uncertainty. */ }
    throw error;
  }
}
