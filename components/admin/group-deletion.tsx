"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoadingState, Modal, StatusMessage } from "@/components/common/workspace-ui";
import { groupDeletionBlocker, groupDeletionError, type GroupDeletionStatus } from "@/lib/domain/admin-groups";
import { groupCode } from "@/lib/domain/seasons";
import type { GroupSummary } from "@/lib/domain/types";
import { deleteEmptyGroup, loadGroupDeletionStatus } from "@/lib/supabase/group-deletion";

export function GroupDeletion({ client, group, onClose, onDeleted }: { client: SupabaseClient; group: GroupSummary; onClose: () => void; onDeleted: () => void }) {
  const [state, setState] = useState<GroupDeletionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const saving = useRef(false);
  const load = useCallback(async () => {
    const ticket = ++request.current;
    setLoading(true); setError(null); setState(null);
    try {
      const result = await loadGroupDeletionStatus(client, group.id);
      if (ticket === request.current) setState(result);
    } catch (caught) { if (ticket === request.current) setError(groupDeletionError(caught)); }
    finally { if (ticket === request.current) setLoading(false); }
  }, [client, group.id]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);
  const blocker = state ? groupDeletionBlocker(state) : null;
  const close = () => { if (!saving.current) onClose(); };
  async function remove() {
    if (saving.current || !state || blocker) return;
    saving.current = true; setBusy(true); setError(null);
    try { await deleteEmptyGroup(client, group.id); onDeleted(); }
    catch (caught) { setState(null); setError(groupDeletionError(caught)); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Modal title={`Видалити групу ${groupCode(group)}?`} onClose={close} footer={<>
    <button type="button" className="secondary-action" onClick={close} disabled={busy}>Закрити</button>
    {(!state || blocker || !state.is_active) && !loading && <button type="button" className="secondary-action" onClick={() => void load()} disabled={busy}>Перевірити стан</button>}
    {state?.is_active === false ? <button type="button" className="primary-action" onClick={onDeleted}>Оновити перелік</button> : <button type="button" className="danger-action" onClick={() => void remove()} disabled={busy || loading || !state || Boolean(blocker)}><Trash2 size={17} />{busy ? "Видалення…" : "Видалити групу"}</button>}
  </>}>
    <p>Порожня група зникне з робочих переліків. Призначення тренерів до неї буде завершено. Історія занять, відвідування та інші збережені записи залишаться.</p>
    {loading ? <LoadingState label="Перевіряємо склад і розклад групи…" /> : state && <div className="detail-list"><p>Гравців: <b>{state.player_count}</b></p><p>Майбутніх або поточних занять: <b>{state.future_event_count}</b></p><p>Записів у розкладі занять: <b>{state.weekly_slot_count}</b></p></div>}
    {state?.is_active === false && <StatusMessage kind="success">Групу вже видалено з робочого переліку.</StatusMessage>}
    {blocker && state?.is_active && <StatusMessage kind="warning">{blocker}</StatusMessage>}
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
  </Modal>;
}
