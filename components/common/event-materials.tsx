"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import type { FileAsset } from "@/lib/domain/types";
import { loadEventMaterials } from "@/lib/supabase/event-materials";
import { openPrivateFile } from "@/lib/supabase/files";
import { StatusMessage } from "./workspace-ui";

export function EventMaterials({ client, eventId, taskId, revision = 0 }: { client: SupabaseClient; eventId: string; taskId?: string | null; revision?: number }) {
  const [assets, setAssets] = useState<FileAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    void loadEventMaterials(client, eventId, taskId).then((found) => {
      if (active) setAssets(found);
    }).catch(() => {
      if (active) setError("Не вдалося завантажити перелік документів. Повторіть завантаження.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, eventId, taskId, revision, retry]);

  async function open(asset: FileAsset) {
    try { await openPrivateFile(client, asset); }
    catch { setError("Не вдалося відкрити документ. Перевірте з’єднання й повторіть спробу."); }
  }

  return <section className="text-block span-2" aria-label="Збережені документи заняття">
    <h3>Прикріплені документи</h3>
    {loading ? <p className="muted" role="status">Завантажуємо документи…</p> : error ? <><StatusMessage kind="warning">{error}</StatusMessage><button type="button" className="secondary-action" onClick={() => setRetry((value) => value + 1)}>Повторити завантаження документів</button></> : assets.length ? <div className="file-list">{assets.map((asset) => <button type="button" key={asset.id} onClick={() => void open(asset)}><Paperclip size={17} /><span>{asset.original_name}</span></button>)}</div> : <p className="muted">Прикріплених документів немає.</p>}
  </section>;
}
