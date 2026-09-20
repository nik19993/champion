"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ClipboardCheck, PackagePlus, Save } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, GroupSelect, LoadingState, Pill, StatusMessage, Tabs, WorkspaceHeader } from "@/components/common/workspace-ui";
import type { GroupSummary, InventoryItem, InventoryPermission, Profile } from "@/lib/domain/types";

interface Props { client: SupabaseClient; profile: Profile; groups: GroupSummary[]; }
type InventoryTab = "collect" | "audit";

export function CoachInventory({ client, profile, groups }: Props) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [tab, setTab] = useState<InventoryTab>("collect");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [permission, setPermission] = useState<InventoryPermission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState(0);

  useEffect(() => { if (!groupId && groups[0]) setGroupId(groups[0].id); }, [groupId, groups]);
  const load = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    setLoading(true); setMessage(null);
    const [itemResult, permissionResult] = await Promise.all([
      client.from("inventory_items").select("id, group_id, name, quantity, damaged, lost, needed, is_active").eq("group_id", groupId).eq("is_active", true).order("name"),
      client.from("inventory_permissions").select("id, coach_id, group_id, can_edit_quantity, can_report_issues").eq("group_id", groupId).eq("coach_id", profile.id).maybeSingle(),
    ]);
    setItems((itemResult.data ?? []) as InventoryItem[]);
    setPermission((permissionResult.data as InventoryPermission | null) ?? null);
    setLoading(false);
  }, [client, groupId, profile.id]);
  useEffect(() => { void load(); }, [load]);

  function change(id: string, field: "quantity" | "damaged" | "lost" | "needed", value: number) {
    setItems((rows) => rows.map((row) => row.id === id ? { ...row, [field]: Math.max(0, value) } : row));
  }

  async function save(item: InventoryItem) {
    setSaving(item.id); setMessage(null);
    const payload: Partial<InventoryItem> = {};
    if (permission?.can_edit_quantity) payload.quantity = item.quantity;
    if (permission?.can_report_issues) { payload.damaged = item.damaged; payload.lost = item.lost; payload.needed = item.needed; }
    const result = await client.from("inventory_items").update(payload).eq("id", item.id);
    setSaving(null);
    if (result.error) { setMessage({ kind: "error", text: "Зміни не збережено. Перевірте дозвіл адміністратора." }); return; }
    setMessage({ kind: "success", text: `Позицію «${item.name}» оновлено.` });
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!permission?.can_edit_quantity || !newName.trim()) return;
    setSaving("new"); setMessage(null);
    const result = await client.from("inventory_items").insert({ group_id: groupId, name: newName.trim(), quantity: Math.max(0, newQuantity), damaged: 0, lost: 0, needed: 0, created_by: profile.id }).select("id, group_id, name, quantity, damaged, lost, needed, is_active").single();
    setSaving(null);
    if (result.error) { setMessage({ kind: "error", text: "Позицію не додано. Можливо, така назва вже існує." }); return; }
    setItems((rows) => [...rows, result.data as InventoryItem].sort((a, b) => a.name.localeCompare(b.name, "uk")));
    setNewName(""); setNewQuantity(0); setMessage({ kind: "success", text: "Нову позицію додано й синхронізовано з адміністратором." });
  }

  return <div className="workspace-stack">
    <WorkspaceHeader eyebrow="Окрема вкладка" title="Інвентар" description="Швидкий збір після заняття та окрема повна інвентаризація" actions={groups.length ? <GroupSelect groups={groups} value={groupId} onChange={setGroupId} /> : undefined} />
    {!groups.length ? <EmptyState title="Команди ще не призначені">Адміністратор має призначити вам щонайменше одну команду.</EmptyState> : loading ? <LoadingState label="Завантажуємо інвентар…" /> : <>
      <Tabs<InventoryTab> label="Режим роботи з інвентарем" value={tab} onChange={setTab} items={[{ value: "collect", label: "Зібрати після тренування", badge: items.length }, { value: "audit", label: "Інвентаризація" }]} />
      {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
      {tab === "collect" ? items.length ? <section className="inventory-collection" aria-label="Інвентар, який потрібно зібрати після тренування">
        <div className="inventory-collection-help"><ClipboardCheck size={20} /><p>Після заняття перевірте кожну позицію вибраної групи та зберіть зазначену кількість.</p></div>
        <div className="inventory-collection-list">{items.map((item) => <article key={item.id}><span className="tile-icon teal"><PackagePlus /></span><div><h2>{item.name}</h2><p>Зібрати після заняття</p></div><strong>{item.quantity}<small>шт.</small></strong></article>)}</div>
      </section> : <EmptyState title="Інвентар для цієї групи ще не внесено" /> : <>
        <div className="permission-strip"><div><b>Кількість</b><Pill tone={permission?.can_edit_quantity ? "success" : "neutral"}>{permission?.can_edit_quantity ? "Дозволено редагувати" : "Лише перегляд"}</Pill></div><div><b>Втрати й придбання</b><Pill tone={permission?.can_report_issues ? "success" : "neutral"}>{permission?.can_report_issues ? "Дозволено редагувати" : "Лише перегляд"}</Pill></div></div>
        {items.length ? <div className="inventory-list">{items.map((item) => <article key={item.id}><div className="inventory-name"><span className="tile-icon teal"><PackagePlus /></span><div><h2>{item.name}</h2></div></div><div className="inventory-fields"><label><span>Кількість</span><input type="number" min={0} value={item.quantity} disabled={!permission?.can_edit_quantity} onChange={(e) => change(item.id, "quantity", Number(e.target.value))} /></label><label><span>Пошкоджено</span><input type="number" min={0} value={item.damaged} disabled={!permission?.can_report_issues} onChange={(e) => change(item.id, "damaged", Number(e.target.value))} /></label><label><span>Втрачено</span><input type="number" min={0} value={item.lost} disabled={!permission?.can_report_issues} onChange={(e) => change(item.id, "lost", Number(e.target.value))} /></label><label><span>Потрібно придбати</span><input type="number" min={0} value={item.needed} disabled={!permission?.can_report_issues} onChange={(e) => change(item.id, "needed", Number(e.target.value))} /></label>{(permission?.can_edit_quantity || permission?.can_report_issues) && <button className="secondary-action" type="button" onClick={() => void save(item)} disabled={saving === item.id}><Save size={17} />{saving === item.id ? "Збереження…" : "Зберегти"}</button>}</div></article>)}</div> : <EmptyState title="Інвентар ще не внесено" />}
        {permission?.can_edit_quantity && <form className="add-inventory-card" onSubmit={add}><div><h2>Додати позицію</h2><p>Наприклад: «Манішки червоні», «М’ячі №4» або «Конуси високі».</p></div><label><span>Назва</span><input value={newName} onChange={(e) => setNewName(e.target.value)} required /></label><label><span>Кількість</span><input type="number" min={0} value={newQuantity} onChange={(e) => setNewQuantity(Number(e.target.value))} /></label><button className="primary-action" disabled={saving === "new"}><PackagePlus size={18} />Додати</button></form>}
      </>}
    </>}
  </div>;
}
