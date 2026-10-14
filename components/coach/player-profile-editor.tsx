"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useState, type FormEvent } from "react";
import { Modal, StatusMessage } from "@/components/common/workspace-ui";
import { normalizeBirthDate } from "@/lib/domain/player-import";
import type { Player, Guardian } from "@/lib/domain/types";

export function PlayerProfileEditor({ client, groupId, player, onClose, onSaved }: { client: SupabaseClient; groupId: string; player?: Player; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(player?.full_name ?? "");
  const [dob, setDob] = useState(player?.birth_date ?? "");
  const [year, setYear] = useState(player?.birth_year?.toString() ?? "");
  const [position, setPosition] = useState(player?.position ?? "");
  const [foot, setFoot] = useState(player?.dominant_foot ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault(); setError(null);
    const birthDate = dob ? normalizeBirthDate(dob) : null;
    if (dob && !birthDate) { setError("Перевірте повну дату народження."); return; }
    if (birthDate && year && Number(year) !== Number(birthDate.slice(0, 4))) { setError("Рік і дата народження не збігаються."); return; }
    setBusy(true);
    try {
      const result = await client.rpc("save_player_profile", {
        p_group_id: groupId, p_player_id: player?.id ?? null, p_expected_updated_at: player?.updated_at ?? null,
        p_values: { full_name: name.trim(), birth_date: birthDate ?? "", birth_year: year || birthDate?.slice(0, 4) || "", position: position.trim(), dominant_foot: foot.trim() },
      });
      if (result.error) throw result.error;
      onSaved(); onClose();
    } catch { setError("Дані не збережено. Перевірте доступ або оновіть профіль, якщо його вже змінив інший користувач."); }
    finally { setBusy(false); }
  }
  return <Modal title={player ? "Редагування гравця" : "Новий гравець"} onClose={() => !busy && onClose()} footer={<><button className="secondary-action" type="button" disabled={busy} onClick={onClose}>Скасувати</button><button className="primary-action" form="player-profile-form" disabled={busy}>{busy ? "Збереження…" : "Зберегти"}</button></>}>
    <form id="player-profile-form" className="form-grid" onSubmit={save}>
      <label className="span-2"><span>ПІБ</span><input value={name} minLength={2} maxLength={180} required onChange={(event) => setName(event.target.value)} /></label>
      <label><span>Повна дата народження</span><input type="date" value={dob} onChange={(event) => { setDob(event.target.value); if (event.target.value) setYear(event.target.value.slice(0, 4)); }} /></label>
      <label><span>Рік народження (якщо повна дата невідома)</span><input type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(event.target.value)} /></label>
      <label><span>Амплуа</span><input value={position} maxLength={120} onChange={(event) => setPosition(event.target.value)} /></label>
      <label><span>Провідна нога</span><input value={foot} maxLength={40} onChange={(event) => setFoot(event.target.value)} /></label>
      {error && <div className="span-2"><StatusMessage kind="error">{error}</StatusMessage></div>}
    </form>
  </Modal>;
}

export function GuardianEditor({ client, playerId, guardian, onClose, onSaved }: { client: SupabaseClient; playerId: string; guardian?: Guardian; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState({ full_name: guardian?.full_name ?? "", relation: guardian?.relation ?? "", phone: guardian?.phone ?? "", email: guardian?.email ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await client.rpc("save_player_guardian", { p_player_id: playerId, p_guardian_id: guardian?.id ?? null, p_values: values });
      if (result.error) throw result.error;
      onSaved(); onClose();
    } catch { setError("Контакт не збережено. Перевірте доступ і повторіть спробу."); }
    finally { setBusy(false); }
  }
  return <Modal title={guardian ? "Редагування контакту" : "Контакт батьків або опікунів"} onClose={() => !busy && onClose()} footer={<><button className="secondary-action" type="button" disabled={busy} onClick={onClose}>Скасувати</button><button form="guardian-form" className="primary-action" disabled={busy}>{busy ? "Збереження…" : "Зберегти контакт"}</button></>}>
    <form id="guardian-form" className="form-grid" onSubmit={save}>{([['full_name','Ім’я',180],['relation','Хто це дитині',80],['phone','Телефон',50],['email','Email',254]] as const).map(([key,label,max]) => <label key={key}><span>{label}</span><input type={key === "phone" ? "tel" : key === "email" ? "email" : "text"} value={values[key]} maxLength={max} onChange={(event) => setValues((value) => ({ ...value, [key]: event.target.value }))} /></label>)}{error && <div className="span-2"><StatusMessage kind="error">{error}</StatusMessage></div>}</form>
  </Modal>;
}
