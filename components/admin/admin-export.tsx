"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, FileJson, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, GroupSelect, Pill, StatusMessage, WorkspaceHeader } from "@/components/common/workspace-ui";
import { downloadText, formatDate, formatMonth, toCsv } from "@/lib/domain/format";
import { encryptBackup } from "@/lib/domain/backup";
import type { GroupSummary, Player, Profile } from "@/lib/domain/types";

interface Props { client: SupabaseClient; profile: Profile; groups: GroupSummary[]; }
type ExportKind = "group" | "player" | "tests" | "activity" | "debts" | "uniform" | "operations" | "backup";

function escapeHtml(value: unknown) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character)); }

function printTable(title: string, headers: string[], rows: unknown[][]) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) throw new Error("Popup blocked");
  popup.document.write(`<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{margin:14mm}body{font:14px Arial,sans-serif;color:#201927}h1{font-size:22px}p{color:#655d68}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:8px;border:1px solid #d9d9d9;text-align:left;vertical-align:top}th{background:#4a1556;color:#fff}@media print{thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><h1>${escapeHtml(title)}</h1><p>ЧЕМПІОН · сформовано ${escapeHtml(new Date().toLocaleString("uk-UA"))}</p><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
  popup.document.close();
  window.setTimeout(() => { popup.focus(); popup.print(); }, 250);
}

export function AdminExport({ client, profile, groups }: Props) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  useEffect(() => { if (!groupId) return; void client.from("players").select("id, group_id, full_name, birth_date, birth_year, position, dominant_foot, coach_note, is_active, groups(code)").eq("group_id", groupId).eq("is_active", true).order("full_name").then(({ data }) => { const rows = (data ?? []) as unknown as Player[]; setPlayers(rows); setPlayerId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id ?? ""); }); }, [client, groupId]);
  const group = groups.find((item) => item.id === groupId);
  async function audit(kind: ExportKind, filters: Record<string, unknown>) { await client.from("export_jobs").insert({ export_type: kind, filters, status: "completed", created_by: profile.id, completed_at: new Date().toISOString() }); }
  async function exportGroup(format: "csv" | "print") { setBusy("group"); setMessage(null); const rows = players.map((player) => ({ "ПІБ": player.full_name, "Рік народження": player.birth_date ? new Date(player.birth_date).getFullYear() : player.birth_year ?? "", "Амплуа": player.position ?? "", "Провідна нога": player.dominant_foot ?? "" })); if (format === "csv") downloadText(`ЧЕМПІОН_${group?.code}_гравці.csv`, toCsv(rows), "text/csv;charset=utf-8"); else printTable(`Список команди ${group?.code}`, Object.keys(rows[0] ?? { "ПІБ": "" }), rows.map(Object.values)); await audit("group", { group_id: groupId, format }); setBusy(null); }
  async function exportPlayer() { const player = players.find((item) => item.id === playerId); if (!player) return; setBusy("player"); const [guardianResult, testResult, activityResult] = await Promise.all([client.from("guardians").select("full_name, relation, phone, email").eq("player_id", player.id), client.from("physical_test_results").select("measured_on, metric_name, field_name, value, unit").eq("player_id", player.id).order("measured_on", { ascending: false }), client.from("game_activity_results").select("period, metric_name, value").eq("player_id", player.id).order("created_at", { ascending: false })]); const rows: unknown[][] = [["Команда", group?.code], ["Рік народження", player.birth_date ? new Date(player.birth_date).getFullYear() : player.birth_year], ["Амплуа", player.position], ["Провідна нога", player.dominant_foot], ...((guardianResult.data ?? []).map((guardian) => [guardian.relation || "Контакт", `${guardian.full_name || ""} ${guardian.phone || ""} ${guardian.email || ""}`])), ...((testResult.data ?? []).map((test) => [`Тест ${formatDate(test.measured_on)}`, `${test.metric_name}: ${test.field_name} — ${test.value} ${test.unit ?? ""}`])), ...((activityResult.data ?? []).map((item) => [`Ігрова діяльність ${item.period}`, `${item.metric_name}: ${item.value}`]))]; printTable(`Профіль гравця ${player.full_name}`, ["Поле", "Значення"], rows); await audit("player", { player_id: player.id, format: "print" }); setBusy(null); }
  async function exportDataset(kind: "tests" | "activity", format: "csv" | "print") {
    setBusy(kind);
    const result = kind === "tests"
      ? await client.from("physical_test_results").select("measured_on, metric_name, field_name, value, unit, players!inner(full_name, group_id)").eq("players.group_id", groupId)
      : await client.from("game_activity_results").select("period, metric_name, value, players!inner(full_name, group_id)").eq("players.group_id", groupId);
    if (result.error) { setMessage({ kind: "error", text: "Не вдалося сформувати експорт." }); setBusy(null); return; }
    const raw = (result.data ?? []) as unknown as Array<{ measured_on?: string; period?: string; metric_name: string; field_name?: string; value: string; unit?: string | null; players: { full_name: string } }>;
    const rows = raw.map((row) => kind === "tests"
      ? { "Гравець": row.players.full_name, "Дата": row.measured_on ?? "", "Тест": row.metric_name, "Поле результату": row.field_name ?? "", "Значення": row.value, "Одиниця": row.unit ?? "" }
      : { "Гравець": row.players.full_name, "Період": row.period ?? "", "Показник": row.metric_name, "Значення": row.value });
    if (format === "csv") downloadText(`ЧЕМПІОН_${group?.code}_${kind}.csv`, toCsv(rows), "text/csv;charset=utf-8");
    else printTable(`${kind === "tests" ? "Тестування фізичної підготовленості" : "Складові ігрової діяльності"} · ${group?.code}`, Object.keys(rows[0] ?? {}), rows.map(Object.values));
    await audit(kind, { group_id: groupId, format });
    setBusy(null);
  }
  async function exportDebts(format: "csv" | "print") {
    setBusy("debts");
    setMessage(null);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const playerResult = await client.from("players").select("id, full_name").eq("group_id", groupId).eq("is_active", true).order("full_name");
    if (playerResult.error) {
      setMessage({ kind: "error", text: "Не вдалося завантажити гравців для звіту." });
      setBusy(null);
      return;
    }
    const debtPlayers = playerResult.data ?? [];
    const paymentResult = debtPlayers.length
      ? await client.from("monthly_payments").select("player_id, month, status").in("player_id", debtPlayers.map((player) => player.id)).lte("month", currentMonth).order("month", { ascending: false })
      : { data: [], error: null };
    if (paymentResult.error) {
      setMessage({ kind: "error", text: "Не вдалося завантажити дані про заборгованість." });
      setBusy(null);
      return;
    }
    const payments = paymentResult.data ?? [];
    const rows = debtPlayers.flatMap((player) => {
      const playerPayments = payments.filter((payment) => payment.player_id === player.id);
      const unpaidMonths = new Set(playerPayments.filter((payment) => payment.status === "unpaid").map((payment) => payment.month));
      const currentPayment = playerPayments.find((payment) => payment.month === currentMonth);
      if (!currentPayment || currentPayment.status === "unpaid") unpaidMonths.add(currentMonth);
      const months = [...unpaidMonths].sort().reverse();
      if (!months.length) return [];
      return [{
        "Група": group?.code ?? "",
        "Гравець": player.full_name,
        "Неоплачені місяці": months.map((month) => formatMonth(month.slice(0, 7))).join("; "),
        "Кількість неоплачених місяців": months.length,
        "Поточний місяць": months.includes(currentMonth) ? "Не сплачено" : "Сплачено",
        "Борг за минулі місяці": months.some((month) => month < currentMonth) ? "Так" : "Ні",
      }];
    });
    if (!rows.length) {
      setMessage({ kind: "success", text: `У групі ${group?.code ?? ""} заборгованостей немає.` });
      setBusy(null);
      return;
    }
    if (format === "csv") downloadText(`ЧЕМПІОН_${group?.code}_заборгованість.csv`, toCsv(rows), "text/csv;charset=utf-8");
    else printTable(`Заборгованість гравців · ${group?.code}`, Object.keys(rows[0]), rows.map(Object.values));
    await audit("debts", { group_id: groupId, format, players: rows.length, through_month: currentMonth });
    setBusy(null);
  }
  async function exportUniform() { setBusy("uniform"); const result = await client.from("uniform_requests").select("status, number, surname_print, admin_note, players!inner(full_name, groups!inner(id, code)), uniform_request_items(size, quantity, uniform_catalog_items(name))").eq("players.groups.id", groupId); const rows = (result.data ?? []).flatMap((request) => { const player = request.players as unknown as { full_name: string; groups: { code: string } }; const items = request.uniform_request_items as unknown as Array<{ size: string; quantity: number; uniform_catalog_items: { name: string } }>; return items.map((item) => ({ "Гравець": player.full_name, "Команда": player.groups.code, "Прізвище": request.surname_print ?? "", "Номер": request.number ?? "", "Позиція": item.uniform_catalog_items.name, "Розмір": item.size, "Кількість": item.quantity, "Стан": request.status })); }); downloadText(`ЧЕМПІОН_${group?.code}_форма.csv`, toCsv(rows), "text/csv;charset=utf-8"); await audit("uniform", { group_id: groupId, format: "csv" }); setBusy(null); }
  async function exportOperations() { setBusy("operations"); const start = new Date(); start.setDate(start.getDate() - 30); const result = await client.from("operational_items").select("created_at, item_type, status, title, comment, groups(code)").neq("item_type", "conflict").gte("created_at", start.toISOString()).order("created_at", { ascending: false }); const rows = (result.data ?? []).map((item) => ({ "Дата": item.created_at, "Команда": (item.groups as unknown as { code: string })?.code ?? "", "Тип": item.item_type, "Стан": item.status, "Ситуація": item.title, "Коментар": item.comment ?? "" })); downloadText("ЧЕМПІОН_операційний_звіт.csv", toCsv(rows), "text/csv;charset=utf-8"); await audit("operations", { period_days: 30, format: "csv" }); setBusy(null); }
  async function backup() { const passphrase = window.prompt("Задайте пароль резервної копії (щонайменше 12 символів). Збережіть його окремо: відновити втрачений пароль неможливо."); if (!passphrase) return; setBusy("backup"); setMessage(null); try { const tables = ["profiles", "groups", "coach_group_assignments", "venues", "players", "guardians", "evaluation_metrics", "evaluation_metric_fields", "physical_test_sessions", "physical_test_results", "game_activity_results", "monthly_payments", "uniform_catalog_items", "uniform_requests", "uniform_request_items", "methodology_tasks", "terminology_entries", "training_structures", "training_structure_steps", "methodology_sections", "methodology_section_materials", "events", "attendance_sessions", "attendance_records", "operational_items", "inventory_items", "inventory_permissions", "inventory_adjustments", "announcements", "announcement_targets", "announcement_reads", "file_assets", "player_photos", "event_materials", "methodology_materials", "monthly_star_themes", "player_behavior_cards", "parent_contact_actions", "monthly_star_awards"]; const data: Record<string, unknown> = { generated_at: new Date().toISOString(), club: "Клуб Чемпіон", schema_version: "1.3" }; for (const table of tables) { const result = await client.from(table).select("*"); if (result.error) throw new Error(`Помилка таблиці ${table}`); data[table] = result.data; } const encrypted = await encryptBackup(JSON.stringify(data), passphrase); downloadText(`ЧЕМПІОН_backup_${new Date().toISOString().slice(0, 10)}.encrypted.json`, JSON.stringify(encrypted), "application/json"); await audit("backup", { tables: tables.length, format: "encrypted-json", cipher: encrypted.cipher }); } catch (error) { setMessage({ kind: "error", text: error instanceof Error ? error.message : "Резервну копію не сформовано." }); } finally { setBusy(null); } }
  const cards: Array<{ kind: ExportKind; title: string; description: string; actions: React.ReactNode }> = [
    { kind: "group", title: "Список команди", description: "ПІБ, рік народження, амплуа та провідна нога.", actions: <><button onClick={() => void exportGroup("print")}><Printer />Друк / PDF</button><button onClick={() => void exportGroup("csv")}><Download />CSV</button></> },
    { kind: "player", title: "Профіль гравця", description: "Контакти, тести та дозволені результати оцінювання.", actions: <button onClick={() => void exportPlayer()} disabled={!playerId}><Printer />Друк / PDF</button> },
    { kind: "tests", title: "Тестування фізичної підготовленості", description: "Первинні результати групи без автоматичного рейтингу.", actions: <><button onClick={() => void exportDataset("tests", "print")}><Printer />Друк / PDF</button><button onClick={() => void exportDataset("tests", "csv")}><Download />CSV</button></> },
    { kind: "activity", title: "Складові ігрової діяльності", description: "Структуровані результати без загальної оцінки 50/50.", actions: <><button onClick={() => void exportDataset("activity", "print")}><Printer />Друк / PDF</button><button onClick={() => void exportDataset("activity", "csv")}><Download />CSV</button></> },
    { kind: "debts", title: "Заборгованість гравців", description: "Лише гравці вибраної групи з несплатою за поточний або минулі місяці.", actions: <><button onClick={() => void exportDebts("print")}><Printer />Друк / PDF</button><button onClick={() => void exportDebts("csv")}><Download />CSV</button></> },
    { kind: "uniform", title: "Запити на форму", description: "Позиції, розміри, номери та стан підготовки.", actions: <button onClick={() => void exportUniform()}><Download />CSV</button> },
    { kind: "operations", title: "План і загальний звіт", description: "Операційні ситуації за останні 30 днів.", actions: <button onClick={() => void exportOperations()}><Download />CSV</button> },
    { kind: "backup", title: "Адміністративна резервна копія", description: "JSON, зашифрований AES-256-GCM вашим паролем. Недоступно тренеру.", actions: <button onClick={() => void backup()}><FileJson />Зашифрований JSON</button> },
  ];
  return <div className="workspace-stack"><WorkspaceHeader eyebrow="Друк і файли" title="Експорт" description="Файли містять дату формування, застосовану групу та назву клубу" actions={groups.length ? <GroupSelect groups={groups} value={groupId} onChange={setGroupId} /> : undefined} />{message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}<section className="export-player-select"><label><span>Гравець для профілю</span><select value={playerId} onChange={(e) => setPlayerId(e.target.value)}><option value="">Оберіть гравця</option>{players.map((player) => <option value={player.id} key={player.id}>{player.full_name}</option>)}</select></label><Pill tone="plum">{group?.code ?? "—"}</Pill></section>{groups.length ? <div className="export-grid">{cards.map((card) => <article key={card.kind}><div><h2>{card.title}</h2><p>{card.description}</p></div><div className="export-actions">{card.actions}</div>{busy === card.kind && <small>Формування…</small>}</article>)}</div> : <EmptyState title="Групи не налаштовано" />}</div>;
}
