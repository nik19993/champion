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
  const result = await client.from("file_assets").insert(row).select("*").single();
  if (result.error) {
    await client.storage.from(context.bucket).remove([objectPath]);
    throw result.error;
  }
  const validation = await client.functions.invoke("file-validate", { body: { file_asset_id: result.data.id } });
  if (validation.error || (validation.data as { status?: string } | null)?.status !== "clean") {
    const statusResult = await client.from("file_assets").select("*").eq("id", result.data.id).single();
    if (!statusResult.error && statusResult.data?.scan_status === "clean") {
      return statusResult.data as FileAsset;
    }
    await client.storage.from(context.bucket).remove([objectPath]);
    await client.from("file_assets").delete().eq("id", result.data.id);
    throw validation.error ?? new Error("Файл відхилено перевіркою безпеки.");
  }
  return { ...result.data, scan_status: "clean" } as FileAsset;
}

export async function openPrivateFile(client: SupabaseClient, asset: Pick<FileAsset, "bucket" | "object_path">) {
  const result = await client.storage.from(asset.bucket).createSignedUrl(asset.object_path, 600);
  if (result.error || !result.data?.signedUrl) throw result.error ?? new Error("Signed URL is unavailable");
  window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
}
