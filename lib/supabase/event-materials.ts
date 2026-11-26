import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileAsset } from "../domain/types.ts";

export async function loadEventMaterials(client: SupabaseClient, eventId: string, taskId?: string | null): Promise<FileAsset[]> {
  const queries = [client.from("event_materials").select("file_assets(*)").eq("event_id", eventId)];
  if (taskId) queries.push(client.from("methodology_materials").select("file_assets(*)").eq("task_id", taskId));
  const results = await Promise.all(queries);
  for (const result of results) if (result.error) throw result.error;
  const assets = results.flatMap((result) => (result.data ?? []).flatMap((row) => {
    const asset = (row as unknown as { file_assets?: FileAsset | FileAsset[] | null }).file_assets;
    return Array.isArray(asset) ? asset : asset ? [asset] : [];
  })).filter((asset) => asset.scan_status === "clean");
  return [...new Map(assets.map((asset) => [asset.id, asset])).values()];
}

export async function attachEventMaterial(client: SupabaseClient, eventId: string, taskId: string | null, assetId: string) {
  const result = taskId
    ? await client.rpc("attach_event_task_material", { p_event_id: eventId, p_task_id: taskId, p_file_asset_id: assetId })
    : await client.rpc("attach_event_material", { p_event_id: eventId, p_file_asset_id: assetId });
  // An RPC response can be lost after the transaction commits. Confirm the link
  // separately so retrying cannot create a second upload for a saved document.
  const confirmed = await client.from("event_materials").select("file_asset_id").eq("event_id", eventId).eq("file_asset_id", assetId).maybeSingle();
  if (!confirmed.error && confirmed.data?.file_asset_id === assetId) return;
  throw result.error ?? confirmed.error ?? new Error("Зв’язок документа із заняттям не підтверджено. Повторіть прикріплення.");
}
