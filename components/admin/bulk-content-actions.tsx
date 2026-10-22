"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { Modal, StatusMessage } from "@/components/common/workspace-ui";
import { contentVersions, type ContentDataset, type ContentVersion } from "@/lib/domain/content-batch";
interface Row extends ContentVersion { is_active: boolean }
export function BulkContentActions({ client, dataset, rows, selected, onSelected, onChanged }: {
  client: SupabaseClient; dataset: ContentDataset; rows: Row[]; selected: string[]; onSelected: (ids: string[]) => void; onChanged: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState<{ rows: Row[]; all: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const active = rows.filter(row => row.is_active);
  async function remove() {
    if (!confirmation || busy) return;
    setBusy(true); setMessage(null);
    try {
      const result = await client.rpc("archive_content", { p_dataset: dataset, p_rows: contentVersions(confirmation.rows), p_all: confirmation.all });
      if (result.error || result.data !== confirmation.rows.length) throw new Error("Не вдалося підтвердити видалення. Оновіть перелік і повторіть спробу.");
      onSelected([]); setConfirmation(null); await onChanged();
      setMessage({ kind: "success", text: `Видалено з актуального переліку: ${result.data}. Історичні заняття збережені.` });
    } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Дані не видалено. Оновіть перелік." }); }
    finally { setBusy(false); }
  }
  return <section className="bulk-content-actions">
    <div className="bulk-content-buttons"><strong>Пакетні дії · активних {active.length}</strong>
      <button type="button" className="secondary-action small" disabled={!active.length || busy} onClick={() => onSelected(selected.length ? [] : active.map(row => row.id))}>{selected.length ? "Зняти вибір" : "Вибрати всі"}</button>
      <button type="button" className="secondary-action small" disabled={!selected.length || busy} onClick={() => { setMessage(null); setConfirmation({ rows: active.filter(row => selected.includes(row.id)), all: false }); }}>Видалити вибрані ({selected.length})</button>
      <button type="button" className="warning-action small" disabled={!active.length || busy} onClick={() => { setMessage(null); setConfirmation({ rows: active, all: true }); }}>Видалити всі {dataset === "tasks" ? "завдання" : "терміни"}</button>
    </div>
    {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
    {confirmation && <Modal title="Підтвердіть пакетне видалення" onClose={() => { if (!busy) setConfirmation(null); }} footer={<><button type="button" className="secondary-action" disabled={busy} onClick={() => setConfirmation(null)}>Скасувати</button><button type="button" className="warning-action" disabled={busy} onClick={() => void remove()}>{busy ? "Видалення…" : `Підтвердити видалення (${confirmation.rows.length})`}</button></>}>
      <p>Буде прибрано з актуального переліку. Кількість записів: {confirmation.rows.length}{confirmation.all && dataset === "tasks" ? " для всіх вікових груп" : ""}. Проведені тренування та їхні завдання залишаться в історії.</p>
      {message?.kind === "error" && <StatusMessage kind="error">{message.text}</StatusMessage>}
    </Modal>}
  </section>;
}
