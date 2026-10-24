"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { Award, Check } from "lucide-react";
import { Modal, StatusMessage } from "@/components/common/workspace-ui";
import type { PlayerClubCard } from "@/lib/domain/types";
export function ClubCardAction({ client, eventId, player, card, disabled, onChanged, onInteractionChange }: {
  client: SupabaseClient; eventId: string; player: { id: string; full_name: string }; card?: PlayerClubCard; disabled: boolean;
  onChanged: () => void | Promise<void>; onInteractionChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [comment, setComment] = useState(""); const [error, setError] = useState<string | null>(null);
  function close() { if (busy) return; setOpen(false); setComment(""); setError(null); onInteractionChange(false); }
  async function save() {
    if (busy || (card && !comment.trim())) return;
    setBusy(true); setError(null);
    try {
      const result = card
        ? await client.rpc("void_club_card", { p_card_id: card.id, p_reason: comment.trim() })
        : await client.rpc("record_club_card", { p_event_id: eventId, p_player_id: player.id, p_comment: comment.trim() || null });
      if (result.error || (!card && typeof result.data !== "string")) throw new Error("Картку клубу не збережено. Оновіть відмітки та повторіть спробу.");
      setOpen(false); setComment(""); onInteractionChange(false); await onChanged();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Картку клубу не збережено."); }
    finally { setBusy(false); }
  }
  return <div className="club-card-control">
    {card && <span className="club-card-recorded"><Check size={15} />Картку клубу збережено</span>}
    <button type="button" className={card ? "text-action" : "club-card-action secondary-action small"} disabled={disabled} onClick={() => { setOpen(true); setError(null); onInteractionChange(true); }}><Award size={16} />{card ? "Анулювати картку клубу" : "Картка клубу"}</button>
    {open && <Modal title={`${card ? "Анулювання картки клубу" : "Картка клубу"} · ${player.full_name}`} onClose={close} footer={<><button type="button" className="secondary-action" disabled={busy} onClick={close}>Скасувати</button><button type="button" className="primary-action" disabled={busy || Boolean(card && !comment.trim())} onClick={() => void save()}>{busy ? "Збереження…" : card ? "Підтвердити анулювання" : "Зафіксувати картку клубу"}</button></>}>
      <p>{card ? "Поясніть причину анулювання помилкової відзнаки." : "Позитивна відзнака за цінний для клубу вчинок або поведінку."}</p>
      <label className="form-stack"><span>{card ? "Причина анулювання" : "За що відзначено (необов’язково)"}</span><textarea value={comment} maxLength={2000} rows={3} disabled={busy} onChange={event => setComment(event.target.value)} /></label>
      {error && <StatusMessage kind="error">{error}</StatusMessage>}
    </Modal>}
  </div>;
}
