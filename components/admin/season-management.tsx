"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Modal, StatusMessage } from "@/components/common/workspace-ui";
import { previewSeason, seasonName } from "@/lib/domain/seasons";
import type { GroupSummary } from "@/lib/domain/types";

export function SeasonManagement({ client, groups, onSaved }: { client: SupabaseClient; groups: GroupSummary[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const [available, setAvailable] = useState(false);
  const [initialYear, setInitialYear] = useState("");
  const [cohorts, setCohorts] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    let active = true;
    void client.from("club_season_settings").select("start_year").maybeSingle().then((result) => {
      if (!active) return;
      setAvailable(!result.error);
      setCurrent(result.data?.start_year ?? null);
    });
    return () => { active = false; };
  }, [client, groups]);
  const initial = Number(initialYear);
  const initialValid = /^20\d{2}$/.test(initialYear) && initial < 2100;
  const ageGroups = groups.filter((group) => group.group_kind === "age");
  const target = current == null ? initial : current + 1;
  const previewGroups = current == null ? ageGroups.map((group) => ({ ...group, cohort_birth_year: Number(cohorts[group.id]) || null })) : groups;
  const preview = previewSeason(previewGroups, target);
  const needsRule = preview.some((row) => row.age == null || row.age < 6 || row.age > 99);
  const initialMismatch = current == null && ageGroups.some((group) => initial + 1 - Number(cohorts[group.id]) !== group.age);

  async function save() {
    if (!confirmed || busy || needsRule || initialMismatch || (current == null && !initialValid)) return;
    setBusy(true); setMessage(null);
    try {
      const result = current == null
        ? await client.rpc("initialize_club_season", { p_start_year: initial, p_cohorts: Object.fromEntries(ageGroups.map((group) => [group.id, Number(cohorts[group.id])])) })
        : await client.rpc("advance_club_season", { p_expected_start_year: current, p_next_start_year: current + 1 });
      if (result.error) throw result.error;
      setCurrent(target); setOpen(false); setConfirmed(false);
      setMessage({ kind: "success", text: `Сезон ${seasonName(target)} збережено. Склад та історія гравців збережені.` });
      onSaved();
    } catch {
      setMessage({ kind: "error", text: "Сезон не змінено. Оновіть групи й перевірте попередній перегляд повторно." });
    } finally { setBusy(false); }
  }

  return <section className="panel-section">
    <div className="section-title-row"><div><p className="eyebrow">Сезон клубу</p><h2>{current == null ? "Початковий сезон не встановлено" : seasonName(current)}</h2></div><button className="secondary-action" type="button" disabled={!available} onClick={() => { setConfirmed(false); setMessage(null); setOpen(true); }}>{current == null ? "Налаштувати сезон" : "Перейти до наступного сезону"}</button></div>
    {!available && <p className="muted">Налаштування сезону буде доступне після погодження серверних змін.</p>}
    {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
    {open && <Modal title={current == null ? "Початковий сезон" : `Перехід ${seasonName(current)} → ${seasonName(current + 1)}`} onClose={() => !busy && setOpen(false)} wide footer={<><button className="secondary-action" type="button" disabled={busy} onClick={() => setOpen(false)}>Скасувати</button><button className="primary-action" type="button" disabled={busy || !confirmed || needsRule || initialMismatch || (current == null && !initialValid)} onClick={() => void save()}>{busy ? "Збереження…" : "Підтвердити сезон"}</button></>}>
      {current == null && <label className="compact-field"><span>Рік початку сезону (наприклад, 2026 для 2026/2027)</span><input type="number" min={2000} max={2099} value={initialYear} onChange={(event) => { setInitialYear(event.target.value); setConfirmed(false); }} /></label>}
      <p>Перевірте вікові позначки та роки народження. Гравці, тренери й історичні записи залишаться прив’язаними до тих самих груп.</p>
      <div className="responsive-table"><table><thead><tr><th>Поточна група</th><th>Рік народження</th><th>Нова позначка</th></tr></thead><tbody>{preview.map((row) => <tr key={row.id}><td>{row.previous}</td><td>{current == null ? <input aria-label={`Рік народження ${row.previous}`} type="number" min={2000} max={2100} value={cohorts[row.id!] ?? ""} onChange={(event) => { setCohorts((value) => ({ ...value, [row.id!]: event.target.value })); setConfirmed(false); }} /> : row.birthYear}</td><td>{(current != null || initialValid) ? row.next ?? "Вкажіть рік народження" : "Вкажіть сезон"}</td></tr>)}</tbody></table></div>
      {needsRule && <StatusMessage kind="warning">Перевірте роки народження: для всіх вікових груп має бути визначена коректна вікова позначка.</StatusMessage>}
      {initialMismatch && initialValid && <StatusMessage kind="warning">Початковий сезон і роки народження мають відповідати чинним віковим позначкам. Дані дітей автоматично не змінюються.</StatusMessage>}
      <label className="check-field"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Я перевірив сезон, групи та роки народження.</span></label>
      {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
    </Modal>}
  </section>;
}
