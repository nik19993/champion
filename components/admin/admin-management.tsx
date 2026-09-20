"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BellRing, ChevronDown, Copy, KeyRound, MapPinned, Pencil, RefreshCw, Trash2, Users } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Accordion, EmptyState, LoadingState, Modal, Pill, StatusMessage, WorkspaceHeader } from "@/components/common/workspace-ui";
import { EvaluationManagement } from "@/components/admin/evaluation-management";
import { InventoryManagement } from "@/components/admin/inventory-management";
import { MethodologyManagement } from "@/components/admin/admin-management-methodology";
import type { GroupSummary, Profile, Venue } from "@/lib/domain/types";

interface Props { client: SupabaseClient; profile: Profile; groups: GroupSummary[]; onMfaRequired?: () => void; }
type Section = "announcements" | "users" | "inventory" | "venues" | "evaluation" | "program" | "structure" | "terms" | "materials" | "imports";

export function AdminManagement({ client, profile, groups, onMfaRequired }: Props) {
  const [open, setOpen] = useState<Section | null>(null);
  const toggle = (value: Section) => setOpen((current) => current === value ? null : value);
  return <div className="workspace-stack"><WorkspaceHeader eyebrow="Системні налаштування" title="Керування" description="Розділи згортаються, щоб потрібна дія завжди залишалась поруч" /><div className="accordion-list"><Accordion priority="1" title="Оголошення тренерам" open={open === "announcements"} onToggle={() => toggle("announcements")}><AnnouncementManagement client={client} profile={profile} groups={groups} /></Accordion><Accordion priority="2" title="Користувачі й паролі" open={open === "users"} onToggle={() => toggle("users")}><UserManagement client={client} groups={groups} onMfaRequired={onMfaRequired} /></Accordion><Accordion title="Інвентар" open={open === "inventory"} onToggle={() => toggle("inventory")}><InventoryManagement client={client} profile={profile} groups={groups} /></Accordion><Accordion title="Поля й майданчики" open={open === "venues"} onToggle={() => toggle("venues")}><VenueManagement client={client} profile={profile} /></Accordion><Accordion title="Тестування й оцінювання" open={open === "evaluation"} onToggle={() => toggle("evaluation")}><EvaluationManagement client={client} profile={profile} /></Accordion><MethodologyManagement client={client} profile={profile} groups={groups} open={open} onOpen={toggle} /></div></div>;
}

interface AnnouncementTarget {
  target_type: "all" | "coach" | "age" | "group";
  coach_id: string | null;
  age: number | null;
  group_id: string | null;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  starts_at: string;
  ends_at?: string | null;
  require_acknowledgement: boolean;
  is_active: boolean;
  announcement_targets?: AnnouncementTarget[];
}

function AnnouncementManagement({ client, profile, groups }: { client: SupabaseClient; profile: Profile; groups: GroupSummary[] }) {
  const [coaches, setCoaches] = useState<Profile[]>([]);
  const [history, setHistory] = useState<AnnouncementRow[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [all, setAll] = useState(true);
  const [coachIds, setCoachIds] = useState<string[]>([]);
  const [ages, setAges] = useState<number[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AnnouncementRow | null>(null);
  const load = useCallback(async () => {
    const [coachResult, announcementResult] = await Promise.all([
      client.from("profiles").select("id, full_name, first_name, last_name, middle_name, email, role, status").eq("role", "coach").eq("status", "active").order("full_name"),
      client.from("announcements").select("id, title, body, starts_at, ends_at, require_acknowledgement, is_active, announcement_targets(target_type, coach_id, age, group_id)").order("created_at", { ascending: false }).limit(20),
    ]);
    setCoaches((coachResult.data ?? []) as Profile[]);
    setHistory((announcementResult.data ?? []) as unknown as AnnouncementRow[]);
  }, [client]);
  useEffect(() => { void load(); }, [load]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setEndsAt("");
    setCoachIds([]);
    setAges([]);
    setGroupIds([]);
    setAll(true);
    setAck(false);
  }

  function edit(item: AnnouncementRow) {
    const targets = item.announcement_targets ?? [];
    setEditingId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setEndsAt(item.ends_at?.slice(0, 10) ?? "");
    setAll(targets.some((target) => target.target_type === "all"));
    setCoachIds(targets.filter((target) => target.target_type === "coach" && target.coach_id).map((target) => target.coach_id as string));
    setAges(targets.filter((target) => target.target_type === "age" && target.age != null).map((target) => target.age as number));
    setGroupIds(targets.filter((target) => target.target_type === "group" && target.group_id).map((target) => target.group_id as string));
    setAck(item.require_acknowledgement);
    setMessage(null);
    window.requestAnimationFrame(() => document.getElementById("announcement-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function buildTargets(announcementId: string): Array<{ announcement_id: string; target_type: string; coach_id: string | null; age: number | null; group_id: string | null }> {
    return all
      ? [{ announcement_id: announcementId, target_type: "all", coach_id: null, age: null, group_id: null }]
      : [
          ...coachIds.map((coachId) => ({ announcement_id: announcementId, target_type: "coach", coach_id: coachId, age: null, group_id: null })),
          ...ages.map((age) => ({ announcement_id: announcementId, target_type: "age", coach_id: null, age, group_id: null })),
          ...groupIds.map((groupId) => ({ announcement_id: announcementId, target_type: "group", coach_id: null, age: null, group_id: groupId })),
        ];
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const values = {
      title: title.trim(),
      body: body.trim(),
      ends_at: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
      require_acknowledgement: ack,
      updated_by: profile.id,
      updated_at: new Date().toISOString(),
    };
    if (editingId) {
      const previous = history.find((item) => item.id === editingId);
      const updateResult = await client.from("announcements").update(values).eq("id", editingId).select("id").single();
      if (updateResult.error) {
        setBusy(false);
        setMessage("Оголошення не оновлено.");
        return;
      }
      const removeResult = await client.from("announcement_targets").delete().eq("announcement_id", editingId);
      if (removeResult.error) {
        setBusy(false);
        setMessage("Одержувачів не оновлено. Спробуйте ще раз.");
        return;
      }
      const targetResult = await client.from("announcement_targets").insert(buildTargets(editingId));
      if (targetResult.error) {
        if (previous?.announcement_targets?.length) {
          await client.from("announcement_targets").insert(previous.announcement_targets.map((target) => ({ ...target, announcement_id: editingId })));
        }
        setBusy(false);
        setMessage("Текст збережено, але одержувачів не оновлено. Спробуйте ще раз.");
        return;
      }
      resetForm();
      setBusy(false);
      setMessage("Оголошення оновлено.");
      await load();
      return;
    }
    const result = await client.from("announcements").insert({ ...values, starts_at: new Date().toISOString(), is_active: true, created_by: profile.id }).select("id").single();
    if (result.error) {
      setBusy(false);
      setMessage("Оголошення не створено.");
      return;
    }
    const targetResult = await client.from("announcement_targets").insert(buildTargets(result.data.id as string));
    if (targetResult.error) {
      await client.from("announcements").delete().eq("id", result.data.id);
      setBusy(false);
      setMessage("Оголошення не створено: не вдалося зберегти одержувачів.");
      return;
    }
    resetForm();
    setBusy(false);
    setMessage("Оголошення створено. Воно з’явиться лише у вкладці «План» відповідних тренерів.");
    await load();
  }

  async function remove() {
    if (!pendingDelete) return;
    setBusy(true);
    const result = await client.from("announcements").delete().eq("id", pendingDelete.id);
    setBusy(false);
    if (result.error) {
      setMessage("Оголошення не видалено.");
      setPendingDelete(null);
      return;
    }
    if (editingId === pendingDelete.id) resetForm();
    setPendingDelete(null);
    setMessage("Оголошення видалено.");
    await load();
  }

  const hasError = message?.includes("не створено") || message?.includes("не оновлено") || message?.includes("не видалено");
  return <>
    <div className="management-grid">
      <form id="announcement-editor" className="form-stack management-form announcement-editor" onSubmit={submit}>
        <div className="form-title-row"><h3>{editingId ? "Редагування оголошення" : "Нове оголошення"}</h3>{editingId && <button type="button" className="secondary-action small" onClick={resetForm}>Скасувати</button>}</div>
        <label><span>Назва</span><input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        <label><span>Текст</span><textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} required /></label>
        <label><span>Показувати до</span><input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label>
        <label className="check-field"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>Попросити позначити ознайомлення</span></label>
        <fieldset>
          <legend>Одержувачі</legend>
          <label className="check-field"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>Усі тренери</span></label>
          {!all && <>
            <p className="field-caption">Конкретні тренери</p>
            <div className="checkbox-grid">{coaches.map((coach) => <label className="check-field" key={coach.id}><input type="checkbox" checked={coachIds.includes(coach.id)} onChange={(e) => setCoachIds((ids) => e.target.checked ? [...ids, coach.id] : ids.filter((id) => id !== coach.id))} /><span>{coach.full_name}</span></label>)}</div>
            <p className="field-caption">Вікові категорії — усі команди відповідного віку</p>
            <div className="age-picker">{Array.from({ length: 10 }, (_, index) => index + 6).map((age) => <button type="button" key={age} className={ages.includes(age) ? "active" : ""} onClick={() => setAges((values) => values.includes(age) ? values.filter((value) => value !== age) : [...values, age])}>U{age}</button>)}</div>
            <p className="field-caption">Конкретні групи</p>
            <GroupAssignmentPicker groups={groups} selected={groupIds} onChange={setGroupIds} />
          </>}
        </fieldset>
        {message && <StatusMessage kind={hasError ? "error" : "success"}>{message}</StatusMessage>}
        <button className="primary-action" disabled={busy || (!all && !coachIds.length && !ages.length && !groupIds.length)}><BellRing size={18} />{busy ? "Збереження…" : editingId ? "Зберегти зміни" : "Створити оголошення"}</button>
      </form>
      <div><h3 className="management-title">Останні оголошення</h3>{history.length ? <div className="compact-list announcement-history">{history.map((item) => <article key={item.id}><div className="announcement-history-copy"><b>{item.title}</b><small>{item.ends_at ? `До ${new Date(item.ends_at).toLocaleDateString("uk-UA")}` : "Без кінцевої дати"}</small></div><Pill tone={item.is_active ? "success" : "neutral"}>{item.is_active ? "Активне" : "Вимкнене"}</Pill><div className="row-actions"><button type="button" className="secondary-action small" onClick={() => edit(item)}><Pencil size={15} />Редагувати</button><button type="button" className="danger-action small" onClick={() => setPendingDelete(item)}><Trash2 size={15} />Видалити</button></div></article>)}</div> : <EmptyState title="Оголошень ще немає" />}</div>
    </div>
    {pendingDelete && <Modal title="Видалити оголошення?" onClose={() => setPendingDelete(null)} footer={<><button type="button" className="secondary-action" onClick={() => setPendingDelete(null)}>Скасувати</button><button type="button" className="danger-action" disabled={busy} onClick={() => void remove()}><Trash2 size={17} />{busy ? "Видалення…" : "Видалити"}</button></>}><p className="confirmation-copy">Оголошення «{pendingDelete.title}» зникне у всіх тренерів. Цю дію неможливо скасувати.</p></Modal>}
  </>;
}

interface UserRow extends Profile { coach_group_assignments?: Array<{ group_id: string; assignment_role: "lead" | "assistant"; is_active: boolean }>; }

const TEMPORARY_PASSWORD_LENGTH = 16;
const PASSWORD_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

function secureRandomIndex(max: number) {
  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0] % max;
}

function generateTemporaryPassword() {
  const characters = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%"]
    .map((set) => set[secureRandomIndex(set.length)]);
  while (characters.length < TEMPORARY_PASSWORD_LENGTH) {
    characters.push(PASSWORD_CHARACTERS[secureRandomIndex(PASSWORD_CHARACTERS.length)]);
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const target = secureRandomIndex(index + 1);
    [characters[index], characters[target]] = [characters[target], characters[index]];
  }
  return characters.join("");
}

function isStrongTemporaryPassword(password: string) {
  return password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function GroupAssignmentPicker({ groups, selected, onChange }: { groups: GroupSummary[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const sections = [
    { title: "Вікові команди", items: groups.filter((group) => group.group_kind === "age") },
    { title: "Воротарські групи", items: groups.filter((group) => group.group_kind === "goalkeeper") },
  ];
  return <div>{sections.map((section) => section.items.length ? <div key={section.title} className="assignment-section"><p className="field-caption">{section.title}</p><div className="checkbox-grid">{section.items.map((group) => <label className="check-field" key={group.id}><input type="checkbox" checked={selected.includes(group.id)} onChange={(event) => onChange(event.target.checked ? [...selected, group.id] : selected.filter((id) => id !== group.id))} /><span>{group.code}</span></label>)}</div></div> : null)}</div>;
}

function adminUserError(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : String(error ?? "");
  if (code.includes("MFA_REQUIRED")) return "Потрібна повторна двоетапна перевірка адміністратора. Після підтвердження ви повернетеся до цього розділу.";
  if (code.includes("EMAIL_EXISTS") || /already registered|already exists|email.*used/i.test(code)) return "Користувач із такою електронною адресою вже існує.";
  if (code.includes("PASSWORD_POLICY") || /weak.password|password.*character|password.*symbol/i.test(code)) return "Тимчасовий пароль має містити щонайменше 12 символів, велику й малу літери, цифру та спеціальний знак. Скористайтеся кнопкою «Згенерувати».";
  if (code.includes("INVALID_INPUT")) return "Перевірте обов’язкові поля, електронну адресу та тимчасовий пароль.";
  if (code.includes("GROUP_ASSIGNMENT_FAILED")) return "Користувача не створено, тому що вибрану групу не вдалося призначити. Оновіть групи та повторіть дію.";
  if (code.includes("PROFILE_UPDATE_FAILED")) return "Користувача не створено через помилку профілю. Повторіть дію після оновлення сторінки.";
  if (code.includes("SERVER_CONFIG")) return "Захищена функція не має серверного ключа Supabase. Потрібне повторне розгортання конфігурації.";
  if (code.includes("FORBIDDEN")) return "Ця дія доступна лише активному адміністратору після MFA.";
  if (code.includes("UNAUTHORIZED")) return "Сеанс завершився. Увійдіть знову й повторіть дію.";
  return fallback;
}

function UserManagement({ client, groups, onMfaRequired }: { client: SupabaseClient; groups: GroupSummary[]; onMfaRequired?: () => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [form, setForm] = useState({ last_name: "", first_name: "", middle_name: "", email: "", role: "coach" as "coach" | "admin", password: "", group_ids: [] as string[] });
  const load = useCallback(async () => {
    setLoading(true);
    const result = await client.from("profiles").select("id, full_name, first_name, last_name, middle_name, email, role, status, must_change_password, coach_group_assignments!coach_group_assignments_coach_id_fkey(group_id, assignment_role, is_active)").order("full_name");
    if (result.error) setMessage({ kind: "error", text: "Список користувачів не завантажено. Оновіть захищену сесію." });
    else setUsers((result.data ?? []) as unknown as UserRow[]);
    setLoading(false);
  }, [client]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setForm((current) => current.password ? current : { ...current, password: generateTemporaryPassword() }); }, []);

  async function refreshProtectedSession() {
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error) throw new Error("UNAUTHORIZED");
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error || assurance.data?.currentLevel !== "aal2") {
      onMfaRequired?.();
      throw new Error("MFA_REQUIRED");
    }
  }

  async function invoke(body: Record<string, unknown>) {
    await refreshProtectedSession();
    const result = await client.functions.invoke("admin-users", { body });
    const payload = result.data as { error?: string; message?: string } | null;
    if (result.error) {
      let code = payload?.error;
      const context = (result.error as { context?: Response }).context;
      if (!code && context) {
        const responsePayload = await context.clone().json().catch(() => null) as { error?: string } | null;
        code = responsePayload?.error;
      }
      throw new Error(code ?? result.error.message);
    }
    if (payload?.error) throw new Error(payload.error);
    return payload;
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password);
      setMessage({ kind: "success", text: "Тимчасовий пароль скопійовано." });
    } catch {
      setMessage({ kind: "warning", text: "Автоматичне копіювання недоступне. Виділіть пароль і скопіюйте його вручну." });
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setCreatedCredentials(null);
    if (!isStrongTemporaryPassword(form.password)) {
      setMessage({ kind: "error", text: adminUserError(new Error("PASSWORD_POLICY"), "Тимчасовий пароль не відповідає вимогам.") });
      return;
    }
    const credentials = { email: form.email.trim().toLowerCase(), password: form.password };
    setBusy(true);
    try {
      await invoke({ action: "create", ...form });
      setCreatedCredentials(credentials);
      setMessage({ kind: "success", text: "Користувача створено й вибрані групи призначено. Скопіюйте тимчасовий пароль для першого входу." });
      setForm({ last_name: "", first_name: "", middle_name: "", email: "", role: "coach", password: generateTemporaryPassword(), group_ids: [] });
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: adminUserError(error, "Користувача не створено. Оновіть захищену сесію та повторіть дію.") });
    } finally {
      setBusy(false);
    }
  }

  async function setAccess(user: UserRow, enabled: boolean) { setMessage(null); try { await invoke({ action: "access", user_id: user.id, enabled }); setUsers((rows) => rows.map((row) => row.id === user.id ? { ...row, status: enabled ? "active" : "suspended" } : row)); } catch (error) { setMessage({ kind: "error", text: adminUserError(error, "Стан доступу не змінено.") }); } }
  async function resetPassword(user: UserRow) { const password = window.prompt(`Новий тимчасовий пароль для ${user.full_name} (щонайменше 12 символів, великі й малі літери, цифра та спеціальний знак):`, generateTemporaryPassword()); if (!password) return; if (!isStrongTemporaryPassword(password)) { setMessage({ kind: "error", text: adminUserError(new Error("PASSWORD_POLICY"), "Пароль не скинуто.") }); return; } try { await invoke({ action: "reset_password", user_id: user.id, password }); setCreatedCredentials({ email: user.email ?? "", password }); setMessage({ kind: "success", text: "Новий тимчасовий пароль встановлено. Скопіюйте й передайте його користувачу." }); } catch (error) { setMessage({ kind: "error", text: adminUserError(error, "Пароль не скинуто.") }); } }
  async function updateGroups(user: UserRow, groupIds: string[]) { try { await invoke({ action: "assign_groups", user_id: user.id, group_ids: groupIds }); setUsers((rows) => rows.map((row) => row.id === user.id ? { ...row, coach_group_assignments: groupIds.map((groupId) => ({ group_id: groupId, assignment_role: "lead", is_active: true })) } : row)); setMessage({ kind: "success", text: "Групи тренера оновлено." }); } catch (error) { setMessage({ kind: "error", text: adminUserError(error, "Призначення груп не збережено. Перевірте, чи кожна група має лише одного основного тренера.") }); } }

  return <div className="management-grid users-management"><form className="form-stack management-form" onSubmit={create}><h3>Новий користувач</h3><div className="form-grid"><label><span>Прізвище</span><input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required /></label><label><span>Ім’я</span><input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></label><label><span>По батькові</span><input value={form.middle_name} onChange={(e) => setForm({ ...form, middle_name: e.target.value })} /></label><label><span>Роль</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "coach" | "admin" })}><option value="coach">Тренер</option><option value="admin">Адміністратор</option></select></label><label className="span-2"><span>Електронна адреса</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label><label className="span-2"><span>Тимчасовий пароль</span><input type="text" minLength={12} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /><small className="field-help">12+ символів: велика й мала літери, цифра та спеціальний знак.</small><span className="password-field-actions"><button type="button" className="secondary-action small" onClick={() => setForm({ ...form, password: generateTemporaryPassword() })}><RefreshCw size={15} />Згенерувати</button><button type="button" className="secondary-action small" onClick={() => void copyPassword(form.password)} disabled={!form.password}><Copy size={15} />Копіювати</button></span></label>{form.role === "coach" && <fieldset className="span-2"><legend>Групи тренера</legend>{groups.length ? <GroupAssignmentPicker groups={groups} selected={form.group_ids} onChange={(groupIds) => setForm({ ...form, group_ids: groupIds })} /> : <StatusMessage kind="error">Групи не завантажено. Спочатку повторіть завантаження робочого простору.</StatusMessage>}</fieldset>}</div><button className="primary-action" disabled={busy || (form.role === "coach" && !groups.length)}><KeyRound size={18} />{busy ? "Створення…" : "Створити користувача"}</button>{createdCredentials && <div className="temporary-credentials" aria-live="polite"><div><b>Дані для першого входу</b><small>{createdCredentials.email}</small><code>{createdCredentials.password}</code></div><button type="button" className="secondary-action small" onClick={() => void copyPassword(createdCredentials.password)}><Copy size={15} />Копіювати пароль</button></div>}</form><div><h3 className="management-title">Користувачі</h3><p className="user-list-help">Картки згорнуті. Для перевірки входу тренера використовуйте окреме приватне вікно браузера, щоб не завершувати сеанс адміністратора.</p>{message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}{loading ? <LoadingState /> : <div className="user-list">{users.map((user) => { const assigned = (user.coach_group_assignments ?? []).filter((item) => item.is_active).map((item) => item.group_id); const assignedCodes = assigned.map((groupId) => groups.find((group) => group.id === groupId)?.code).filter((code): code is string => Boolean(code)); const expanded = expandedUserId === user.id; const hasLogin = Boolean(user.email); return <article key={user.id} className={expanded ? "open" : ""}><button type="button" className="user-summary-button" aria-expanded={expanded} onClick={() => setExpandedUserId(expanded ? null : user.id)}><span className="tile-icon plum"><Users /></span><span className="user-summary-copy"><b>{user.full_name}</b><small>{user.role === "admin" ? "Адміністратор" : "Тренер"} · {user.email || "службовий запис без логіна"}</small>{user.role === "coach" && <small className="user-groups-summary">{assignedCodes.length ? `Групи: ${assignedCodes.join(", ")}` : "Групи не призначено"}</small>}</span><Pill tone={!hasLogin ? "neutral" : user.status === "active" ? "success" : "danger"}>{!hasLogin ? "Без входу" : user.status === "active" ? "Доступ дозволено" : "Доступ заборонено"}</Pill><ChevronDown className="user-expand-icon" size={20} aria-hidden="true" /></button>{expanded && <div className="user-expanded-panel">{user.role === "coach" && <div className="assignment-picker"><GroupAssignmentPicker groups={groups} selected={assigned} onChange={(groupIds) => void updateGroups(user, groupIds)} /></div>}{hasLogin ? <div className="row-actions"><button type="button" className="secondary-action" onClick={() => void resetPassword(user)}><KeyRound size={16} />Скинути пароль</button><button type="button" className={user.status === "active" ? "danger-action" : "secondary-action"} onClick={() => void setAccess(user, user.status !== "active")}>{user.status === "active" ? "Заборонити доступ" : "Дозволити доступ"}</button></div> : <p className="muted user-login-note">Це службовий тестовий запис без облікового запису Auth. Увійти під ним неможливо.</p>}</div>}</article>; })}</div>}</div></div>;
}

function VenueManagement({ client, profile }: { client: SupabaseClient; profile: Profile }) {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("field");
  const load = useCallback(async () => { const result = await client.from("venues").select("id, name, venue_type, is_active").order("name"); setVenues((result.data ?? []) as Venue[]); }, [client]);
  useEffect(() => { void load(); }, [load]);
  async function add(event: FormEvent) { event.preventDefault(); await client.from("venues").insert({ name: name.trim(), venue_type: type, is_active: true, created_by: profile.id }); setName(""); void load(); }
  async function toggle(venue: Venue) { await client.from("venues").update({ is_active: !venue.is_active, updated_by: profile.id }).eq("id", venue.id); void load(); }
  return <div className="management-grid"><form className="form-stack management-form" onSubmit={add}><h3>Додати поле або майданчик</h3><label><span>Назва</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label><label><span>Тип</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="field">Поле</option><option value="small_pitch">Малий майданчик</option><option value="hall">Зал</option><option value="other">Інший ресурс</option></select></label><button className="primary-action"><MapPinned size={18} />Додати</button></form><div className="compact-list">{venues.map((venue) => <article key={venue.id}><div><b>{venue.name}</b><small>{venue.venue_type}</small></div><button type="button" className="secondary-action small" onClick={() => void toggle(venue)}>{venue.is_active ? "Деактивувати" : "Активувати"}</button></article>)}</div></div>;
}
