"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Pencil, Save, Star, Trophy } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, GroupSelect, LoadingState, Pill, StatusMessage } from "@/components/common/workspace-ui";
import { formatMonth, kyivDateKey } from "@/lib/domain/format";
import type { GroupSummary, MonthlyStarTheme, Profile } from "@/lib/domain/types";

function currentMonthInput() {
  return kyivDateKey(new Date()).slice(0, 7);
}

interface AdminAwardRow {
  id: string;
  player_id: string;
  players: { full_name: string } | Array<{ full_name: string }> | null;
}

function relationOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function AdminMonthlyStarResults({ client, group, month, theme }: { client: SupabaseClient; group: GroupSummary; month: string; theme?: MonthlyStarTheme }) {
  const [awards, setAwards] = useState<AdminAwardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void client.from("monthly_star_awards").select("id, player_id, players!inner(full_name)").eq("group_id", group.id).eq("month", month).is("revoked_at", null).order("created_at").then((result) => {
      if (!active) return;
      setAwards((result.data ?? []) as unknown as AdminAwardRow[]);
      setError(result.error ? "Не вдалося завантажити визначених зірок." : null);
      setLoading(false);
    });
    return () => { active = false; };
  }, [client, group.id, month]);

  return <div className="admin-star-results">
    <div className="monthly-star-group-theme"><Star /><div><p>Зірка місяця · {group.code}</p><h3>{theme ? `${formatMonth(month).split(" ")[0]} — ${theme.title}` : formatMonth(month)}</h3>{theme && <span>{theme.description}</span>}</div></div>
    <StatusMessage kind="success">Переможців визначає тренер групи. Адміністратор переглядає результат і керує темою місяця, але не ставить карток та не змінює вибір тренера.</StatusMessage>
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
    {loading ? <LoadingState /> : awards.length ? <div className="admin-star-winner-list">{awards.map((award) => <article key={award.id}><span className="tile-icon gold"><Trophy /></span><div><b>{relationOne(award.players)?.full_name ?? "Гравець"}</b><small>Зірка місяця</small></div></article>)}</div> : <EmptyState title="Тренер ще не визначив зірок за цей місяць" />}
  </div>;
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

  return <div className="monthly-star-admin"><div className="management-grid"><form id="monthly-star-theme-form" className="form-stack management-form" onSubmit={save}><div className="form-title-row"><div><p className="eyebrow">Одна тема для всіх груп</p><h3>{existing ? "Редагування теми місяця" : "Нова тема місяця"}</h3></div><Star /></div><label><span>Місяць</span><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} required /></label><label><span>Назва теми</span><input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} placeholder="Наприклад, Місяць техніки" /></label><label><span>Опис для тренерів</span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={1200} /></label><label><span>Критерії — необов’язково</span><textarea rows={3} value={criteria} onChange={(event) => setCriteria(event.target.value)} maxLength={1200} /></label>{message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}<button className="primary-action" disabled={busy}><Save size={17} />{busy ? "Збереження…" : existing ? "Зберегти зміни" : "Створити тему"}</button></form><div><div className="section-title-row"><div><p className="eyebrow">Збережена історія</p><h3>Теми місяців</h3></div><Pill tone="plum">{themes.length}</Pill></div>{loading ? <LoadingState /> : themes.length ? <div className="compact-list star-theme-history">{themes.map((theme) => <article key={theme.id}><div><b>{formatMonth(theme.month)} · {theme.title}</b><small>{theme.description}</small></div><button type="button" className="secondary-action small" onClick={() => editTheme(theme)}><Pencil size={15} />Редагувати</button></article>)}</div> : <EmptyState title="Тем ще немає" />}</div></div><section className="panel-section"><div className="section-title-row"><div><p className="eyebrow">Результати тренерів</p><h2>Визначені зірки за вибраний місяць</h2></div>{groups.length > 0 && <GroupSelect groups={groups} value={selectedGroup?.id ?? ""} onChange={setGroupId} />}</div>{selectedGroup ? <AdminMonthlyStarResults key={`${selectedGroup.id}:${selectedMonth}`} client={client} group={selectedGroup} month={selectedMonth} theme={existing} /> : <EmptyState title="Груп не знайдено" />}</section></div>;
}
