import { corsHeaders, json } from "../_shared/http.ts";
import { requireActiveUser } from "../_shared/user.ts";

const limits: Record<string, number> = {
  methodology: 25 * 1024 * 1024,
  "task-documents": 20 * 1024 * 1024,
  "player-photos": 8 * 1024 * 1024,
  imports: 10 * 1024 * 1024,
  exports: 50 * 1024 * 1024,
};

const allowed: Record<string, Set<string>> = {
  methodology: new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "image/jpeg", "image/png", "image/webp"]),
  "task-documents": new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp"]),
  "player-photos": new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]),
  imports: new Set(["text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  exports: new Set(["text/csv", "application/json", "application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function signatureMatches(bytes: Uint8Array, mime: string) {
  if (mime === "application/pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (mime === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === "image/webp") return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mime === "image/heic") return String.fromCharCode(...bytes.slice(4, 12)).includes("ftyp") && ["heic", "heix", "hevc", "mif1"].some((brand) => String.fromCharCode(...bytes.slice(8, 16)).includes(brand));
  if (mime.includes("openxmlformats-officedocument")) return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
  if (mime === "text/csv" || mime === "application/vnd.ms-excel" || mime === "application/json") return !bytes.slice(0, 4096).includes(0);
  return false;
}

function suspicious(bytes: Uint8Array, mime: string) {
  const content = new TextDecoder("latin1").decode(bytes).toLocaleLowerCase("en-US");
  if (content.includes("eicar-standard-antivirus-test-file")) return "MALWARE_TEST_SIGNATURE";
  if (mime === "application/pdf" && ["/javascript", "/launch", "/openaction", "/embeddedfile", "/richmedia"].some((marker) => content.includes(marker))) return "ACTIVE_PDF_CONTENT";
  if (mime.includes("openxmlformats-officedocument") && ["vbaproject.bin", "activex/", "embeddings/", "externallinks/"].some((marker) => content.includes(marker))) return "ACTIVE_OFFICE_CONTENT";
  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { service, userId } = await requireActiveUser(request);
    const body = await request.json() as { file_asset_id?: string };
    if (!body.file_asset_id) return json({ error: "INVALID_INPUT" }, 400);
    const assetResult = await service.from("file_assets").select("id, owner_id, bucket, object_path, mime_type, size_bytes, scan_status").eq("id", body.file_asset_id).single();
    const asset = assetResult.data;
    if (assetResult.error || !asset || asset.owner_id !== userId || asset.scan_status !== "pending") return json({ error: "FILE_NOT_PENDING" }, 403);
    if (!limits[asset.bucket] || asset.size_bytes > limits[asset.bucket] || !allowed[asset.bucket]?.has(asset.mime_type)) return reject(service, asset, "TYPE_OR_SIZE_REJECTED");
    const download = await service.storage.from(asset.bucket).download(asset.object_path);
    if (download.error) return json({ error: "DOWNLOAD_FAILED" }, 400);
    const bytes = new Uint8Array(await download.data.arrayBuffer());
    const threat = suspicious(bytes, asset.mime_type);
    if (bytes.length !== asset.size_bytes || !signatureMatches(bytes, asset.mime_type) || threat) return reject(service, asset, threat ?? "SIGNATURE_MISMATCH");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    const update = await service.from("file_assets").update({ scan_status: "clean", checksum }).eq("id", asset.id).eq("scan_status", "pending");
    if (update.error) return json({ error: "VALIDATION_UPDATE_FAILED" }, 500);
    return json({ status: "clean", checksum });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SERVER_ERROR";
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return json({ error: code }, status);
  }
});

async function reject(service: Awaited<ReturnType<typeof requireActiveUser>>["service"], asset: { id: string; bucket: string; object_path: string }, reason: string) {
  await service.from("file_assets").update({ scan_status: "rejected" }).eq("id", asset.id);
  await service.storage.from(asset.bucket).remove([asset.object_path]);
  return json({ status: "rejected", reason });
}
