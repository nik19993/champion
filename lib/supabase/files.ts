import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileAsset } from "@/lib/domain/types";

interface UploadContext {
  bucket: "methodology" | "task-documents" | "player-photos" | "imports" | "exports";
  ownerId: string;
  groupId?: string | null;
  age?: number | null;
  contextType: string;
}

function safeName(name: string) {
  const parts = name.split(".");
  const extension = parts.length > 1 ? `.${parts.pop()?.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  const base = parts.join(".").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "file";
  return `${base}${extension}`;
}

export async function uploadPrivateFile(client: SupabaseClient, file: File, context: UploadContext): Promise<FileAsset> {
  if (context.bucket === "player-photos" && !context.groupId) {
    throw new Error("Для фото гравця не визначено групу.");
  }
  const objectPath = `${context.ownerId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const upload = await client.storage.from(context.bucket).upload(objectPath, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
  if (upload.error) throw upload.error;
  const row = {
    bucket: context.bucket,
    object_path: objectPath,
    original_name: file.name,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    scan_status: "pending",
    owner_id: context.ownerId,
    context_type: context.contextType,
    context_group_id: context.groupId ?? null,
    context_age: context.age ?? null,
  };
  let asset: FileAsset;
  if (context.bucket === "player-photos") {
    const registration = await client.rpc("register_player_photo_asset", {
      p_object_path: objectPath,
      p_original_name: file.name,
      p_mime_type: row.mime_type,
      p_size_bytes: file.size,
      p_group_id: context.groupId,
    });
    if (registration.error || !registration.data) {
      await client.storage.from(context.bucket).remove([objectPath]);
      throw registration.error ?? new Error("Фото не зареєстровано.");
    }
    asset = { id: String(registration.data), ...row } as FileAsset;
  } else {
    // The existing stable RLS read helper cannot see a row during INSERT RETURNING.
    // Confirm registration in a separate statement, keeping the same policies.
    const assetId = crypto.randomUUID();
    const result = await client.from("file_assets").insert({ id: assetId, ...row });
    if (result.error) {
      await client.storage.from(context.bucket).remove([objectPath]);
      throw result.error;
    }
    const registered = await client.from("file_assets").select("*").eq("id", assetId).single();
    if (registered.error || registered.data?.id !== assetId) {
      await client.storage.from(context.bucket).remove([objectPath]);
      await client.from("file_assets").delete().eq("id", assetId);
      throw registered.error ?? new Error("Файл не зареєстровано.");
    }
    asset = registered.data as FileAsset;
  }
  if (!asset.id) {
    await client.storage.from(context.bucket).remove([objectPath]);
    throw new Error("Файл не зареєстровано.");
  }
  const validation = await client.functions.invoke("file-validate", { body: { file_asset_id: asset.id } });
  if (validation.error || (validation.data as { status?: string } | null)?.status !== "clean") {
    const statusResult = await client.from("file_assets").select("*").eq("id", asset.id).single();
    if (!statusResult.error && statusResult.data?.scan_status === "clean") {
      return statusResult.data as FileAsset;
    }
    await client.storage.from(context.bucket).remove([objectPath]);
    await client.from("file_assets").delete().eq("id", asset.id);
    throw validation.error ?? new Error("Файл відхилено перевіркою безпеки.");
  }
  return { ...asset, scan_status: "clean" } as FileAsset;
}

export async function openPrivateFile(client: SupabaseClient, asset: Pick<FileAsset, "bucket" | "object_path">) {
  const result = await client.storage.from(asset.bucket).createSignedUrl(asset.object_path, 600);
  if (result.error || !result.data?.signedUrl) throw result.error ?? new Error("Signed URL is unavailable");
  window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
}

export async function deletePrivateFile(client: SupabaseClient, asset: Pick<FileAsset, "id" | "bucket" | "object_path">) {
  const storageResult = await client.storage.from(asset.bucket).remove([asset.object_path]);
  if (storageResult.error) throw storageResult.error;
  const rowResult = await client.from("file_assets").delete().eq("id", asset.id);
  if (rowResult.error) throw rowResult.error;
}
