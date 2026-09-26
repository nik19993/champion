"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Pencil, Save, Star } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, GroupSelect, LoadingState, Pill, StatusMessage } from "@/components/common/workspace-ui";
import { MonthlyStarGroupPanel } from "@/components/star/monthly-star";
import { formatMonth, kyivDateKey } from "@/lib/domain/format";
import type { GroupSummary, MonthlyStarTheme, Profile } from "@/lib/domain/types";

function currentMonthInput() {
  return kyivDateKey(new Date()).slice(0, 7);
}

export function MonthlyStarManagement({ client, profile, groups }: { client: SupabaseClient; profile: Profile; groups: GroupSummary[] }) {
  const [themes, setThemes] = useState<MonthlyStarTheme[]>([]);
  const [month, setMonth] = useState(currentMonthInput());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const selectedMonth = `${month}-01`;
  const existing = themes.find((theme) => theme.month === selectedMonth);
  const selectedGroup = groups.find((group) => group.id === groupId) ?? groups[0];

  const load = useCallback(async () => {
    setLoading(true);
    const result = await client.from("monthly_star_themes").select("id, month, title, description, criteria").order("month", { ascending: false });
    setThemes((result.data ?? []) as MonthlyStarTheme[]);
    setLoading(false);
  }, [client]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!groupId && groups[0]) setGroupId(groups[0].id);
  }, [groupId, groups]);
  useEffect(() => {
    const theme = themes.find((item) => item.month === selectedMonth);
    setTitle(theme?.title ?? "");
    setDescription(theme?.description ?? "");
    setCriteria(theme?.criteria ?? "");
  }, [selectedMonth, themes]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    const values = { month: selectedMonth, title: title.trim(), description: description.trim(), criteria: criteria.trim() || null, updated_by: profile.id };
    const result = existing
      ? await client.from("monthly_star_themes").update(values).eq("id", existing.id)
      : await client.from("monthly_star_themes").insert({ ...values, created_by: profile.id });
    setBusy(false);
    if (result.error) { setMessage({ kind: "error", text: "Тему місяця не збережено." }); return; }
    setMessage({ kind: "success", text: existing ? "Тему місяця оновлено." : "Тему місяця створено для всіх груп." });
    await load();
  }

  function editTheme(theme: MonthlyStarTheme) {
    setMonth(theme.month.slice(0, 7));
    window.requestAnimationFrame(() => document.getElementById("monthly-star-theme-form")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  return <div className="monthly-star-admin"><div className="management-grid"><form id="monthly-star-theme-form" className="form-stack management-form" onSubmit={save}><div className="form-title-row"><div><p className="eyebrow">Одна тема для всіх груп</p><h3>{existing ? "Редагування теми місяця" : "Нова тема місяця"}</h3></div><Star /></div><label><span>Місяць</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} required /></label><label><span>Назва теми</span><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} placeholder="Наприклад, Місяць техніки" /></label><label><span>Опис для тренерів</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={1200} /></label><label><span>Критерії — необов’язково</span><textarea rows={3} value={criteria} onChange={(event) => setCriteria(event.target.value)} maxLength={1200} /></label>{message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}<button className="primary-action" disabled={busy}><Save size={17} />{busy ? "Збереження…" : existing ? "Зберегти зміни" : "Створити тему"}</button></form><div><div className="section-title-row"><div><p className="eyebrow">Збережена історія</p><h3>Теми місяців</h3></div><Pill tone="plum">{themes.length}</Pill></div>{loading ? <LoadingState /> : themes.length ? <div className="compact-list star-theme-history">{themes.map((theme) => <article key={theme.id}><div><b>{formatMonth(theme.month)} · {theme.title}</b><small>{theme.description}</small></div><button type="button" className="secondary-action small" onClick={() => editTheme(theme)}><Pencil size={15} />Редагувати</button></article>)}</div> : <EmptyState title="Тем ще немає" />}</div></div><section className="panel-section"><div className="section-title-row"><div><p className="eyebrow">Результати й дисципліна</p><h2>Група за поточний місяць</h2></div>{groups.length > 0 && <GroupSelect groups={groups} value={selectedGroup?.id ?? ""} onChange={setGroupId} />}</div>{selectedGroup ? <MonthlyStarGroupPanel key={selectedGroup.id} client={client} profile={profile} group={selectedGroup} adminMode /> : <EmptyState title="Груп не знайдено" />}</section></div>;
}
