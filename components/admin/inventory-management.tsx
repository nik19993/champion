"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Archive, Boxes, Save } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  GroupSelect,
  Pill,
  StatusMessage,
} from "@/components/common/workspace-ui";
import { SaveStateLabel, UndoLastChange, type SaveState } from "@/components/common/save-feedback";
import { clearDraft, draftKey, readDraft, writeDraft } from "@/lib/offline/drafts";
import type {
  GroupSummary,
  InventoryItem,
  InventoryPermission,
  Profile,
} from "@/lib/domain/types";

interface CoachRow extends Profile {
  coach_group_assignments?: Array<{
    group_id: string;
    assignment_role: "lead" | "assistant";
    is_active: boolean;
  }>;
}

interface Props {
  client: SupabaseClient;
  profile: Profile;
  groups: GroupSummary[];
}

type PermissionField = "can_edit_quantity" | "can_report_issues";
type InventoryValues = Pick<InventoryItem, "quantity" | "damaged" | "lost" | "needed">;

function inventoryValues(item: InventoryItem): InventoryValues {
  return { quantity: item.quantity, damaged: item.damaged, lost: item.lost, needed: item.needed };
}

export function InventoryManagement({ client, profile, groups }: Props) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [coaches, setCoaches] = useState<CoachRow[]>([]);
  const [permissions, setPermissions] = useState<InventoryPermission[]>([]);
  const [newName, setNewName] = useState("");
  const [newQuantity, setNewQuantity] = useState(0);
  const [savedItems, setSavedItems] = useState<Record<string, InventoryValues>>({});
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [undoItem, setUndoItem] = useState<{ id: string; name: string; previous: InventoryValues } | null>(null);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const inventoryDraftKey = groupId ? draftKey(profile.id, `admin-inventory:${groupId}`) : "";

  const load = useCallback(async () => {
    if (!groupId) {
      setItems([]);
      setCoaches([]);
      setPermissions([]);
      return;
    }
    setDraftReady(false);

    const [itemResult, coachResult, permissionResult] = await Promise.all([
      client
        .from("inventory_items")
        .select("id, group_id, name, quantity, damaged, lost, needed, is_active")
        .eq("group_id", groupId)
        .eq("is_active", true)
        .order("name"),
      client
        .from("profiles")
        .select(
          "id, full_name, first_name, last_name, middle_name, email, role, status, coach_group_assignments!coach_group_assignments_coach_id_fkey(group_id, assignment_role, is_active)",
        )
        .eq("role", "coach")
        .eq("status", "active"),
      client
        .from("inventory_permissions")
        .select("id, coach_id, group_id, can_edit_quantity, can_report_issues")
        .eq("group_id", groupId),
    ]);

    if (itemResult.error || coachResult.error || permissionResult.error) {
      setItems([]);
      setSavedItems({});
      setSaveStates({});
      setCoaches([]);
      setPermissions([]);
      setMessage({ kind: "error", text: "Дані інвентарю не завантажено." });
      return;
    }

    const serverItems = (itemResult.data ?? []) as InventoryItem[];
    const baseline = Object.fromEntries(serverItems.map((item) => [item.id, inventoryValues(item)]));
    const local = readDraft<Record<string, InventoryValues>>(draftKey(profile.id, `admin-inventory:${groupId}`));
    const restored = local?.value ?? {};
    setSavedItems(baseline);
    setItems(serverItems.map((item) => restored[item.id] ? { ...item, ...restored[item.id] } : item));
    setSaveStates(Object.fromEntries(Object.keys(restored).filter((id) => baseline[id]).map((id) => [id, "dirty" as SaveState])));
    if (Object.keys(restored).some((id) => baseline[id])) setMessage({ kind: "success", text: "Відновлено незбережені зміни інвентарю з цього пристрою." });
    const assigned = ((coachResult.data ?? []) as unknown as CoachRow[]).filter(
      (coach) =>
        coach.coach_group_assignments?.some(
          (assignment) => assignment.group_id === groupId && assignment.is_active,
        ),
    );
    setCoaches(assigned);
    setPermissions((permissionResult.data ?? []) as InventoryPermission[]);
    setDraftReady(true);
  }, [client, groupId, profile.id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  function changeItem(id: string, field: keyof InventoryValues, value: number) {
    const current = items.find((item) => item.id === id);
    if (!current) return;
    const next = { ...current, [field]: Math.max(0, value) };
    const baseline = savedItems[id];
    const state: SaveState = baseline && JSON.stringify(inventoryValues(next)) === JSON.stringify(baseline) ? "saved" : "dirty";
    setItems((rows) => rows.map((row) => row.id === id ? next : row));
    setSaveStates((states) => ({ ...states, [id]: state }));
  }

  async function updateItem(item: InventoryItem) {
    const previous = savedItems[item.id] ?? inventoryValues(item);
    setSavingId(item.id);
    setSaveStates((states) => ({ ...states, [item.id]: "saving" }));
    const result = await client
      .from("inventory_items")
      .update({
        quantity: item.quantity,
        damaged: item.damaged,
        lost: item.lost,
        needed: item.needed,
        updated_by: profile.id,
      })
      .eq("id", item.id)
      .select("id").single();

    setSavingId(null);
    const failed = Boolean(result.error) || result.data?.id !== item.id;
    if (!failed) {
      setSavedItems((values) => ({ ...values, [item.id]: inventoryValues(item) }));
      setSaveStates((states) => ({ ...states, [item.id]: "saved" }));
      setUndoItem({ id: item.id, name: item.name, previous });
    } else {
      setSaveStates((states) => ({ ...states, [item.id]: "error" }));
    }

    setMessage(
      failed
        ? { kind: "error", text: "Позицію не збережено." }
        : { kind: "success", text: `Позицію «${item.name}» оновлено.` },
    );
  }

  async function undoLastItem() {
    if (!undoItem) return;
    setSavingId(undoItem.id);
    const result = await client
      .from("inventory_items")
      .update({ ...undoItem.previous, updated_by: profile.id })
      .eq("id", undoItem.id)
      .select("id").single();
    setSavingId(null);
    if (result.error || result.data?.id !== undoItem.id) {
      setSaveStates((states) => ({ ...states, [undoItem.id]: "error" }));
      setMessage({ kind: "error", text: "Останню зміну інвентарю не скасовано." });
      return;
    }
    setItems((rows) => rows.map((row) => row.id === undoItem.id ? { ...row, ...undoItem.previous } : row));
    setSavedItems((values) => ({ ...values, [undoItem.id]: undoItem.previous }));
    setSaveStates((states) => ({ ...states, [undoItem.id]: "saved" }));
    setMessage({ kind: "success", text: `Останню зміну позиції «${undoItem.name}» скасовано.` });
    setUndoItem(null);
  }

  async function deactivateItem(item: InventoryItem) {
    if (!window.confirm(`Прибрати «${item.name}» з активного переліку?`)) return;

    const result = await client
      .from("inventory_items")
      .update({ is_active: false, updated_by: profile.id })
      .eq("id", item.id);

    if (result.error) {
      setMessage({ kind: "error", text: "Позицію не деактивовано." });
      return;
    }

    setItems((rows) => rows.filter((row) => row.id !== item.id));
    setSavedItems((values) => Object.fromEntries(Object.entries(values).filter(([id]) => id !== item.id)));
    setSaveStates((states) => Object.fromEntries(Object.entries(states).filter(([id]) => id !== item.id)));
    setMessage({
      kind: "success",
      text: `Позицію «${item.name}» прибрано з активного переліку.`,
    });
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    const result = await client
      .from("inventory_items")
      .insert({
        group_id: groupId,
        name: newName.trim(),
        quantity: newQuantity,
        damaged: 0,
        lost: 0,
        needed: 0,
        created_by: profile.id,
      })
      .select("id, group_id, name, quantity, damaged, lost, needed, is_active")
      .single();

    if (result.error) {
      setMessage({ kind: "error", text: "Позицію не додано." });
      return;
    }

    const added = result.data as InventoryItem;
    setItems((rows) => [...rows, added]);
    setSavedItems((values) => ({ ...values, [added.id]: inventoryValues(added) }));
    setNewName("");
    setNewQuantity(0);
    setMessage({ kind: "success", text: "Нову позицію додано." });
  }

  async function setPermission(
    coachId: string,
    field: PermissionField,
    enabled: boolean,
  ) {
    const existing = permissions.find((item) => item.coach_id === coachId);
    const payload = {
      coach_id: coachId,
      group_id: groupId,
      can_edit_quantity:
        field === "can_edit_quantity"
          ? enabled
          : (existing?.can_edit_quantity ?? false),
      can_report_issues:
        field === "can_report_issues"
          ? enabled
          : (existing?.can_report_issues ?? false),
    };

    const result = await client
      .from("inventory_permissions")
      .upsert(payload, { onConflict: "coach_id,group_id" })
      .select("id, coach_id, group_id, can_edit_quantity, can_report_issues")
      .single();

    if (result.error) {
      setMessage({ kind: "error", text: "Дозвіл не змінено." });
      return false;
    }

    setPermissions((rows) => [
      ...rows.filter((item) => item.coach_id !== coachId),
      result.data as InventoryPermission,
    ]);
    return true;
  }

  async function setAll(field: PermissionField, enabled: boolean) {
    const currentByCoach = new Map(
      permissions.map((permission) => [permission.coach_id, permission]),
    );
    const rows = coaches.map((coach) => {
      const current = currentByCoach.get(coach.id);
      return {
        coach_id: coach.id,
        group_id: groupId,
        can_edit_quantity:
          field === "can_edit_quantity"
            ? enabled
            : (current?.can_edit_quantity ?? false),
        can_report_issues:
          field === "can_report_issues"
            ? enabled
            : (current?.can_report_issues ?? false),
      };
    });

    if (!rows.length) return;
    const result = await client
      .from("inventory_permissions")
      .upsert(rows, { onConflict: "coach_id,group_id" })
      .select("id, coach_id, group_id, can_edit_quantity, can_report_issues");

    if (result.error) {
      setMessage({ kind: "error", text: "Групові дозволи не змінено." });
      return;
    }

    setPermissions((result.data ?? []) as InventoryPermission[]);
    setMessage({
      kind: "success",
      text: enabled ? "Дозвіл надано всім тренерам." : "Дозвіл вимкнено для всіх тренерів.",
    });
  }

  return (
    <div className="inventory-admin">
      <div className="section-title-row">
        <GroupSelect groups={groups} value={groupId} onChange={setGroupId} />
        <Pill tone="neutral">Дані синхронізуються з вкладкою тренера</Pill>
      </div>

      {message && <div className="save-message-row"><StatusMessage kind={message.kind}>{message.text}</StatusMessage>{undoItem && message.kind === "success" && <UndoLastChange busy={savingId === undoItem.id} onUndo={undoLastItem} />}</div>}

      {items.length ? (
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Позиція</th>
                <th>Кількість</th>
                <th>Пошкоджено</th>
                <th>Втрачено</th>
                <th>Потрібно</th>
                <th>Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr className={`save-surface ${saveStates[item.id] ?? "idle"}`} key={item.id}>
                  <td>{item.name}</td>
                  {(["quantity", "damaged", "lost", "needed"] as const).map(
                    (field) => (
                      <td key={field}>
                        <input
                          aria-label={`${item.name}: ${field}`}
                          className="table-number"
                          type="number"
                          min={0}
                          value={item[field]}
                          onChange={(event) => changeItem(item.id, field, Number(event.target.value))}
                        />
                      </td>
                    ),
                  )}
                  <td>
                    <div className="row-actions">
                      <button
                        className={`secondary-action small save-action ${saveStates[item.id] ?? "idle"}`}
                        type="button"
                        onClick={() => void updateItem(item)}
                        disabled={savingId === item.id || saveStates[item.id] === "saved" || saveStates[item.id] === "idle"}
                      >
                        <Save size={15} />
                        {savingId === item.id ? "Збереження…" : saveStates[item.id] === "saved" ? "Збережено" : saveStates[item.id] === "error" ? "Повторити" : "Зберегти"}
                      </button>
                      <SaveStateLabel state={saveStates[item.id] ?? "idle"} />
                      <button
                        className="danger-action small"
                        type="button"
                        onClick={() => void deactivateItem(item)}
                      >
                        <Archive size={15} />
                        Прибрати
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Для цієї команди активного інвентарю ще немає" />
      )}

      <form className="inline-add-form" onSubmit={addItem}>
        <label>
          <span>Нова позиція</span>
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Наприклад, Манішки червоні"
            required
          />
        </label>
        <label>
          <span>Кількість</span>
          <input
            type="number"
            min={0}
            value={newQuantity}
            onChange={(event) => setNewQuantity(Number(event.target.value))}
          />
        </label>
        <button className="primary-action" disabled={!groupId}>
          <Boxes size={17} />
          Додати
        </button>
      </form>

      <section className="permission-matrix">
        <div className="permission-heading">
          <div>
            <h3>Дозволи тренерів</h3>
            <p>Кількість та втрати й придбання керуються незалежно.</p>
          </div>
        </div>
        <div className="bulk-permissions">
          <div>
            <b>Кількість</b>
            <button type="button" onClick={() => void setAll("can_edit_quantity", true)}>
              Дозволити всім
            </button>
            <button type="button" onClick={() => void setAll("can_edit_quantity", false)}>
              Заборонити всім
            </button>
          </div>
          <div>
            <b>Втрати й придбання</b>
            <button type="button" onClick={() => void setAll("can_report_issues", true)}>
              Дозволити всім
            </button>
            <button type="button" onClick={() => void setAll("can_report_issues", false)}>
              Лише перегляд усім
            </button>
          </div>
        </div>

        {coaches.length ? (
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Тренер</th>
                  <th>Кількість</th>
                  <th>Втрати й придбання</th>
                </tr>
              </thead>
              <tbody>
                {coaches.map((coach) => {
                  const permission = permissions.find(
                    (item) => item.coach_id === coach.id,
                  );
                  return (
                    <tr key={coach.id}>
                      <td>{coach.full_name}</td>
                      <td>
                        <label className="switch-label">
                          <input
                            type="checkbox"
                            checked={permission?.can_edit_quantity ?? false}
                            onChange={(event) =>
                              void setPermission(
                                coach.id,
                                "can_edit_quantity",
                                event.target.checked,
                              )
                            }
                          />
                          <span>
                            {permission?.can_edit_quantity ? "Дозволено" : "Лише перегляд"}
                          </span>
                        </label>
                      </td>
                      <td>
                        <label className="switch-label">
                          <input
                            type="checkbox"
                            checked={permission?.can_report_issues ?? false}
                            onChange={(event) =>
                              void setPermission(
                                coach.id,
                                "can_report_issues",
                                event.target.checked,
                              )
                            }
                          />
                          <span>
                            {permission?.can_report_issues ? "Дозволено" : "Лише перегляд"}
                          </span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">До цієї команди тренерів ще не призначено.</p>
        )}
      </section>
    </div>
  );
}
