"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ClipboardCheck, PackagePlus, Save } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, GroupSelect, LoadingState, Pill, StatusMessage, Tabs, WorkspaceHeader } from "@/components/common/workspace-ui";
import { SaveStateLabel, UndoLastChange, type SaveState } from "@/components/common/save-feedback";
import { clearDraft, draftKey, readDraft, writeDraft } from "@/lib/offline/drafts";
import type { GroupSummary, InventoryItem, InventoryPermission, Profile } from "@/lib/domain/types";

interface Props { client: SupabaseClient; profile: Profile; groups: GroupSummary[]; }
type InventoryTab = "collect" | "audit";
type InventoryValues = Pick<InventoryItem, "quantity" | "damaged" | "lost" | "needed">;

function inventoryValues(item: InventoryItem): InventoryValues {
  return { quantity: item.quantity, damaged: item.damaged, lost: item.lost, needed: item.needed };
}

export function CoachInventory({ client, profile, groups }: Props) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [tab, setTab] = useState<InventoryTab>("collect");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [permission, setPermission] = useState<InventoryPermission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<Record<string, InventoryValues>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [draftReady, setDraftReady] = useState(false);
  const [undoItem, setUndoItem] = useState<{ id: string; name: string; previous: InventoryValues } | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState(0);
  const inventoryDraftKey = groupId ? draftKey(profile.id, `coach-inventory:${groupId}`) : "";

  useEffect(() => { if (!groupId && groups[0]) setGroupId(groups[0].id); }, [groupId, groups]);
  const load = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    setLoading(true); setDraftReady(false); setMessage(null);
    const [itemResult, permissionResult] = await Promise.all([
      client.from("inventory_items").select("id, group_id, name, quantity, damaged, lost, needed, is_active").eq("group_id", groupId).eq("is_active", true).order("name"),
      client.from("inventory_permissions").select("id, coach_id, group_id, can_edit_quantity, can_report_issues").eq("group_id", groupId).eq("coach_id", profile.id).maybeSingle(),
    ]);
    if (itemResult.error || permissionResult.error) {
      setItems([]);
      setSavedItems({});
      setSaveStates({});
      setPermission(null);
      setMessage({ kind: "error", text: "Інвентар не завантажено. Перевірте з’єднання та повторіть спробу." });
      setLoading(false);
      return;
    }
    const serverItems = (itemResult.data ?? []) as InventoryItem[];
    const baseline = Object.fromEntries(serverItems.map((item) => [item.id, inventoryValues(item)]));
    const local = readDraft<Record<string, InventoryValues>>(draftKey(profile.id, `coach-inventory:${groupId}`));
    const restored = local?.value ?? {};
    setSavedItems(baseline);
    setItems(serverItems.map((item) => restored[item.id] ? { ...item, ...restored[item.id] } : item));
    setSaveStates(Object.fromEntries(Object.keys(restored).filter((id) => baseline[id]).map((id) => [id, "dirty" as SaveState])));
    if (Object.keys(restored).some((id) => baseline[id])) setMessage({ kind: "success", text: "Відновлено незбережені зміни інвентарю з цього пристрою." });
    setPermission((permissionResult.data as InventoryPermission | null) ?? null);
    setLoading(false);
    setDraftReady(true);
  }, [client, groupId, profile.id]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!draftReady || !inventoryDraftKey) return;
    const changed = Object.fromEntries(items.flatMap((item) => {
      const baseline = savedItems[item.id];
      const value = inventoryValues(item);
      return baseline && JSON.stringify(value) !== JSON.stringify(baseline) ? [[item.id, value]] : [];
    }));
    if (Object.keys(changed).length) writeDraft(inventoryDraftKey, profile.id, changed);
    else clearDraft(inventoryDraftKey);
  }, [draftReady, inventoryDraftKey, items, profile.id, savedItems]);

  function change(id: string, field: "quantity" | "damaged" | "lost" | "needed", value: number) {
    const current = items.find((item) => item.id === id);
    if (!current) return;
    const next = { ...current, [field]: Math.max(0, value) };
    const baseline = savedItems[id];
    const state: SaveState = baseline && JSON.stringify(inventoryValues(next)) === JSON.stringify(baseline) ? "saved" : "dirty";
    setItems((rows) => rows.map((row) => row.id === id ? next : row));
    setSaveStates((states) => ({ ...states, [id]: state }));
  }

  function editablePayload(value: InventoryValues) {
    const payload: Partial<InventoryItem> = {};
    if (permission?.can_edit_quantity) payload.quantity = value.quantity;
    if (permission?.can_report_issues) {
      payload.damaged = value.damaged;
      payload.lost = value.lost;
      payload.needed = value.needed;
    }
    return payload;
  }

  async function save(item: InventoryItem) {
    setSaving(item.id); setSaveStates((states) => ({ ...states, [item.id]: "saving" })); setMessage(null);
    const previous = savedItems[item.id] ?? inventoryValues(item);
    const payload = editablePayload(inventoryValues(item));
    const result = await client.from("inventory_items").update(payload).eq("id", item.id);
    setSaving(null);
    if (result.error) { setSaveStates((states) => ({ ...states, [item.id]: "error" })); setMessage({ kind: "error", text: "Зміни не збережено. Перевірте дозвіл адміністратора." }); return; }
    setSavedItems((values) => ({ ...values, [item.id]: inventoryValues(item) }));
    setSaveStates((states) => ({ ...states, [item.id]: "saved" }));
    setUndoItem({ id: item.id, name: item.name, previous });
    setMessage({ kind: "success", text: `Позицію «${item.name}» оновлено.` });
  }

  async function undoLastItem() {
    if (!undoItem) return;
    setSaving(undoItem.id);
    const result = await client.from("inventory_items").update(editablePayload(undoItem.previous)).eq("id", undoItem.id);
    setSaving(null);
    if (result.error) {
      setMessage({ kind: "error", text: "Останню зміну інвентарю не скасовано." });
      return;
    }
    setItems((rows) => rows.map((row) => row.id === undoItem.id ? { ...row, ...undoItem.previous } : row));
    setSavedItems((values) => ({ ...values, [undoItem.id]: undoItem.previous }));
    setSaveStates((states) => ({ ...states, [undoItem.id]: "saved" }));
    setMessage({ kind: "success", text: `Останню зміну позиції «${undoItem.name}» скасовано.` });
    setUndoItem(null);
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
      {message && <div className="save-message-row"><StatusMessage kind={message.kind}>{message.text}</StatusMessage>{undoItem && message.kind === "success" && <UndoLastChange busy={saving === undoItem.id} onUndo={undoLastItem} />}</div>}
      {tab === "collect" ? items.length ? <section className="inventory-collection" aria-label="Інвентар, який потрібно зібрати після тренування">
        <div className="inventory-collection-help"><ClipboardCheck size={20} /><p>Після заняття перевірте кожну позицію вибраної групи та зберіть зазначену кількість.</p></div>
        <div className="inventory-collection-list">{items.map((item) => <article key={item.id}><span className="tile-icon teal"><PackagePlus /></span><div><h2>{item.name}</h2><p>Зібрати після заняття</p></div><strong>{item.quantity}<small>шт.</small></strong></article>)}</div>
      </section> : <EmptyState title="Інвентар для цієї групи ще не внесено" /> : <>
        <div className="permission-strip"><div><b>Кількість</b><Pill tone={permission?.can_edit_quantity ? "success" : "neutral"}>{permission?.can_edit_quantity ? "Дозволено редагувати" : "Лише перегляд"}</Pill></div><div><b>Втрати й придбання</b><Pill tone={permission?.can_report_issues ? "success" : "neutral"}>{permission?.can_report_issues ? "Дозволено редагувати" : "Лише перегляд"}</Pill></div></div>
        {items.length ? <div className="inventory-list">{items.map((item) => <article className={`save-surface ${saveStates[item.id] ?? "idle"}`} key={item.id}><div className="inventory-name"><span className="tile-icon teal"><PackagePlus /></span><div><h2>{item.name}</h2></div></div><div className="inventory-fields"><label><span>Кількість</span><input type="number" min={0} value={item.quantity} disabled={!permission?.can_edit_quantity} onChange={(e) => change(item.id, "quantity", Number(e.target.value))} /></label><label><span>Пошкоджено</span><input type="number" min={0} value={item.damaged} disabled={!permission?.can_report_issues} onChange={(e) => change(item.id, "damaged", Number(e.target.value))} /></label><label><span>Втрачено</span><input type="number" min={0} value={item.lost} disabled={!permission?.can_report_issues} onChange={(e) => change(item.id, "lost", Number(e.target.value))} /></label><label><span>Потрібно придбати</span><input type="number" min={0} value={item.needed} disabled={!permission?.can_report_issues} onChange={(e) => change(item.id, "needed", Number(e.target.value))} /></label>{(permission?.can_edit_quantity || permission?.can_report_issues) && <div className="save-control"><button className={`secondary-action save-action ${saveStates[item.id] ?? "idle"}`} type="button" onClick={() => void save(item)} disabled={saving === item.id || saveStates[item.id] === "saved" || saveStates[item.id] === "idle"}><Save size={17} />{saving === item.id ? "Збереження…" : saveStates[item.id] === "saved" ? "Збережено" : saveStates[item.id] === "error" ? "Повторити" : "Зберегти"}</button><SaveStateLabel state={saveStates[item.id] ?? "idle"} /></div>}</div></article>)}</div> : <EmptyState title="Інвентар ще не внесено" />}
        {permission?.can_edit_quantity && <form className="add-inventory-card" onSubmit={add}><div><h2>Додати позицію</h2><p>Наприклад: «Манішки червоні», «М’ячі №4» або «Конуси високі».</p></div><label><span>Назва</span><input value={newName} onChange={(e) => setNewName(e.target.value)} required /></label><label><span>Кількість</span><input type="number" min={0} value={newQuantity} onChange={(e) => setNewQuantity(Number(e.target.value))} /></label><button className="primary-action" disabled={saving === "new"}><PackagePlus size={18} />Додати</button></form>}
      </>}
    </>}
  </div>;
}
