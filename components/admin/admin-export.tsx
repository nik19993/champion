"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, FileJson, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, GroupSelect, Pill, StatusMessage, WorkspaceHeader } from "@/components/common/workspace-ui";
import { encryptBackup } from "@/lib/domain/backup";
import { downloadBlob, downloadText, formatDate, formatMonth, toCsv, toMonthInput } from "@/lib/domain/format";
import { createMonthlyStarAwardPdf } from "@/lib/domain/monthly-star-award-pdf";
import type { GroupSummary, Player, Profile } from "@/lib/domain/types";

interface Props { client: SupabaseClient; profile: Profile; groups: GroupSummary[]; }
type ExportKind = "group" | "player" | "tests" | "activity" | "monthly-star" | "debts" | "uniform" | "operations" | "backup";

interface MonthlyStarExportRow {
  player_id: string;
  players: { id: string; full_name: string };
  groups: { code: string };
  monthly_star_themes: { title: string };
}

interface CurrentPhotoRow {
  player_id: string;
  file_assets: { bucket: string; object_path: string; scan_status: string };
}

const ALL_GROUPS_VALUE = "__all_groups__";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character] ?? character));
}

function printTable(title: string, headers: string[], rows: unknown[][]) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) throw new Error("Popup blocked");
  popup.document.write(`<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{margin:14mm}body{font:14px Arial,sans-serif;color:#201927}h1{font-size:22px}p{color:#655d68}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:8px;border:1px solid #d9d9d9;text-align:left;vertical-align:top}th{background:#4a1556;color:#fff}@media print{thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><h1>${escapeHtml(title)}</h1><p>ЧЕМПІОН · сформовано ${escapeHtml(new Date().toLocaleString("uk-UA"))}</p><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
  popup.document.close();
  window.setTimeout(() => { popup.focus(); popup.print(); }, 250);
}

function playerGroupCode(player: Player) {
  return player.groups?.code ?? "—";
}

export function AdminExport({ client, profile, groups }: Props) {
  const [groupId, setGroupId] = useState(ALL_GROUPS_VALUE);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [starMonth, setStarMonth] = useState(() => toMonthInput());
  const [message, setMessage] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const allGroups = groupId === ALL_GROUPS_VALUE;
  const group = groups.find((item) => item.id === groupId);
  const selectionLabel = allGroups ? "Усі групи" : group?.code ?? "Група";
  const selectionFileLabel = allGroups ? "усі_групи" : group?.code ?? "група";

  useEffect(() => {
    let active = true;
    if (!groups.length) {
      setPlayers([]);
      setPlayerId("");
      return () => { active = false; };
    }
    void (async () => {
      let query = client
        .from("players")
        .select("id, group_id, full_name, birth_date, birth_year, position, dominant_foot, coach_note, coach_note_author_id, coach_note_author_name, coach_note_updated_at, is_active, groups(code)")
        .eq("is_active", true);
      if (!allGroups) query = query.eq("group_id", groupId);
      const result = await query.order("full_name");
      if (!active) return;
      const rows = ((result.data ?? []) as unknown as Player[]).sort((left, right) => (
        playerGroupCode(left).localeCompare(playerGroupCode(right), "uk-UA")
        || left.full_name.localeCompare(right.full_name, "uk-UA")
      ));
      setPlayers(rows);
      setPlayerId((current) => rows.some((item) => item.id === current) ? current : rows[0]?.id ?? "");
    })();
    return () => { active = false; };
  }, [allGroups, client, groupId, groups.length]);

  async function audit(kind: ExportKind, filters: Record<string, unknown>) {
    await client.from("export_jobs").insert({
      export_type: kind,
      filters: {
        ...filters,
        group_id: allGroups ? null : groupId,
        all_groups: allGroups,
      },
      status: "completed",
      created_by: profile.id,
      completed_at: new Date().toISOString(),
    });
  }

  async function exportGroup(format: "csv" | "print") {
    setBusy("group");
    setMessage(null);
    const rows = players.map((player) => ({
      "Група": playerGroupCode(player),
      "ПІБ": player.full_name,
      "Рік народження": player.birth_date ? new Date(player.birth_date).getFullYear() : player.birth_year ?? "",
      "Амплуа": player.position ?? "",
      "Провідна нога": player.dominant_foot ?? "",
    }));
    if (format === "csv") downloadText(`ЧЕМПІОН_${selectionFileLabel}_гравці.csv`, toCsv(rows), "text/csv;charset=utf-8");
    else printTable(allGroups ? "Список гравців усіх груп" : `Список команди ${selectionLabel}`, Object.keys(rows[0] ?? { "Група": "", "ПІБ": "" }), rows.map(Object.values));
    await audit("group", { format });
    setBusy(null);
  }

  async function exportPlayer() {
    const player = players.find((item) => item.id === playerId);
    if (!player) return;
    setBusy("player");
    const [guardianResult, testResult, activityResult] = await Promise.all([
      client.from("guardians").select("full_name, relation, phone, email").eq("player_id", player.id),
      client.from("physical_test_results").select("measured_on, metric_name, field_name, value, unit").eq("player_id", player.id).order("measured_on", { ascending: false }),
      client.from("game_activity_results").select("period, metric_name, value").eq("player_id", player.id).order("created_at", { ascending: false }),
    ]);
    const rows: unknown[][] = [
      ["Група", playerGroupCode(player)],
      ["Рік народження", player.birth_date ? new Date(player.birth_date).getFullYear() : player.birth_year],
      ["Амплуа", player.position],
      ["Провідна нога", player.dominant_foot],
      ["Коротка характеристика тренера", player.coach_note || "Не додано"],
      ...(player.coach_note_updated_at ? [["Характеристику оновлено", `${formatDate(player.coach_note_updated_at)}${player.coach_note_author_name ? ` · ${player.coach_note_author_name}` : ""}`]] : []),
      ...((guardianResult.data ?? []).map((guardian) => [guardian.relation || "Контакт", `${guardian.full_name || ""} ${guardian.phone || ""} ${guardian.email || ""}`])),
      ...((testResult.data ?? []).map((test) => [`Тест ${formatDate(test.measured_on)}`, `${test.metric_name}: ${test.field_name} — ${test.value} ${test.unit ?? ""}`])),
      ...((activityResult.data ?? []).map((item) => [`Ігрова діяльність ${item.period}`, `${item.metric_name}: ${item.value}`])),
    ];
    printTable(`Профіль гравця ${player.full_name}`, ["Поле", "Значення"], rows);
    await audit("player", { player_id: player.id, format: "print" });
    setBusy(null);
  }

  async function exportDataset(kind: "tests" | "activity", format: "csv" | "print") {
    setBusy(kind);
    let query = kind === "tests"
      ? client.from("physical_test_results").select("measured_on, metric_name, field_name, value, unit, players!inner(full_name, group_id, groups!inner(code))")
      : client.from("game_activity_results").select("period, metric_name, value, players!inner(full_name, group_id, groups!inner(code))");
    if (!allGroups) query = query.eq("players.group_id", groupId);
    const result = await query;
    if (result.error) {
      setMessage({ kind: "error", text: "Не вдалося сформувати експорт." });
      setBusy(null);
      return;
    }
    const raw = (result.data ?? []) as unknown as Array<{
      measured_on?: string;
      period?: string;
      metric_name: string;
      field_name?: string;
      value: string;
      unit?: string | null;
      players: { full_name: string; groups: { code: string } };
    }>;
    const rows = raw.map((row) => kind === "tests"
      ? { "Група": row.players.groups.code, "Гравець": row.players.full_name, "Дата": row.measured_on ?? "", "Тест": row.metric_name, "Поле результату": row.field_name ?? "", "Значення": row.value, "Одиниця": row.unit ?? "" }
      : { "Група": row.players.groups.code, "Гравець": row.players.full_name, "Період": row.period ?? "", "Показник": row.metric_name, "Значення": row.value });
    if (format === "csv") downloadText(`ЧЕМПІОН_${selectionFileLabel}_${kind}.csv`, toCsv(rows), "text/csv;charset=utf-8");
    else printTable(`${kind === "tests" ? "Тестування фізичної підготовленості" : "Складові ігрової діяльності"} · ${selectionLabel}`, Object.keys(rows[0] ?? {}), rows.map(Object.values));
    await audit(kind, { format });
    setBusy(null);
  }

  async function exportDebts(format: "csv" | "print") {
    setBusy("debts");
    setMessage(null);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    let playerQuery = client.from("players").select("id, full_name, group_id, groups(code)").eq("is_active", true);
    if (!allGroups) playerQuery = playerQuery.eq("group_id", groupId);
    const playerResult = await playerQuery.order("full_name");
    if (playerResult.error) {
      setMessage({ kind: "error", text: "Не вдалося завантажити гравців для звіту." });
      setBusy(null);
      return;
    }
    const debtPlayers = (playerResult.data ?? []) as unknown as Array<{ id: string; full_name: string; groups: { code: string } }>;
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
        "Група": player.groups.code,
        "Гравець": player.full_name,
        "Неоплачені місяці": months.map((month) => formatMonth(month.slice(0, 7))).join("; "),
        "Кількість неоплачених місяців": months.length,
        "Поточний місяць": months.includes(currentMonth) ? "Не сплачено" : "Сплачено",
        "Борг за минулі місяці": months.some((month) => month < currentMonth) ? "Так" : "Ні",
      }];
    });
    if (!rows.length) {
      setMessage({ kind: "success", text: allGroups ? "Заборгованостей у жодній групі немає." : `У групі ${selectionLabel} заборгованостей немає.` });
      setBusy(null);
      return;
    }
    if (format === "csv") downloadText(`ЧЕМПІОН_${selectionFileLabel}_заборгованість.csv`, toCsv(rows), "text/csv;charset=utf-8");
    else printTable(`Заборгованість гравців · ${selectionLabel}`, Object.keys(rows[0]), rows.map(Object.values));
    await audit("debts", { format, players: rows.length, through_month: currentMonth });
    setBusy(null);
  }

  async function exportMonthlyStars() {
    setBusy("monthly-star");
    setMessage(null);
    try {
      let awardQuery = client
        .from("monthly_star_awards")
        .select("player_id, players!inner(id, full_name), groups!inner(code), monthly_star_themes!inner(title)")
        .eq("month", `${starMonth}-01`)
        .is("revoked_at", null);
      if (!allGroups) awardQuery = awardQuery.eq("group_id", groupId);
      const awardResult = await awardQuery;
      if (awardResult.error) throw new Error("Не вдалося завантажити перелік нагороджених гравців.");

      const awards = ((awardResult.data ?? []) as unknown as MonthlyStarExportRow[]).sort((left, right) => (
        left.groups.code.localeCompare(right.groups.code, "uk-UA")
        || left.players.full_name.localeCompare(right.players.full_name, "uk-UA")
      ));
      if (!awards.length) {
        setMessage({ kind: "warning", text: `За ${formatMonth(starMonth)} нагород «Зірка місяця» для вибраних груп ще немає.` });
        return;
      }

      const playerIds = [...new Set(awards.map((award) => award.player_id))];
      const photoResult = await client
        .from("player_photos")
        .select("player_id, file_assets!inner(bucket, object_path, scan_status)")
        .in("player_id", playerIds)
        .eq("is_current", true)
        .eq("file_assets.scan_status", "clean");
      if (photoResult.error) throw new Error("Не вдалося перевірити фотографії нагороджених гравців.");

      const currentPhotos = new Map(
        ((photoResult.data ?? []) as unknown as CurrentPhotoRow[]).map((photo) => [photo.player_id, photo.file_assets]),
      );
      const missingPhotoAwards = awards.filter((award) => !currentPhotos.has(award.player_id));
      if (missingPhotoAwards.length) {
        const playersWithoutPhotos = [...new Set(missingPhotoAwards.map((award) => `${award.players.full_name} (${award.groups.code})`))];
        setMessage({ kind: "error", text: `PDF не сформовано. Додайте фото у профілі: ${playersWithoutPhotos.join(", ")}.` });
        return;
      }

      const downloadedPhotos = await Promise.all(awards.map(async (award) => {
        const asset = currentPhotos.get(award.player_id)!;
        const result = await client.storage.from(asset.bucket).download(asset.object_path);
        return { award, photo: result.error ? null : result.data };
      }));
      const unavailablePhotos = downloadedPhotos.filter((item) => !item.photo);
      if (unavailablePhotos.length) {
        const playerNames = [...new Set(unavailablePhotos.map(({ award }) => `${award.players.full_name} (${award.groups.code})`))];
        setMessage({ kind: "error", text: `PDF не сформовано. Не вдалося завантажити фото: ${playerNames.join(", ")}. Перевірте фото у профілі.` });
        return;
      }

      const pdf = await createMonthlyStarAwardPdf(downloadedPhotos.map(({ award, photo }) => ({
        fullName: award.players.full_name,
        groupCode: award.groups.code,
        themeTitle: award.monthly_star_themes.title,
        photo: photo!,
      })));
      const awardCountsByGroup = awards.reduce((counts, award) => counts.set(award.groups.code, (counts.get(award.groups.code) ?? 0) + 1), new Map<string, number>());
      const sheetCount = [...awardCountsByGroup.values()].reduce((total, count) => total + Math.ceil(count / 2), 0);
      downloadBlob(`ЧЕМПІОН_Зірка_місяця_${starMonth}_${selectionFileLabel}_A4_2xA5.pdf`, pdf);
      await audit("monthly-star", { month: `${starMonth}-01`, format: "pdf-a4-two-a5", awards: awards.length, sheets: sheetCount });
      setMessage({ kind: "success", text: `PDF A4 сформовано: ${awards.length} нагород на ${sheetCount} арк.` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "PDF нагород не сформовано." });
    } finally {
      setBusy(null);
    }
  }

  async function exportUniform() {
    setBusy("uniform");
    let query = client.from("uniform_requests").select("status, number, surname_print, admin_note, players!inner(full_name, group_id, groups!inner(id, code)), uniform_request_items(size, quantity, uniform_catalog_items(name))");
    if (!allGroups) query = query.eq("players.group_id", groupId);
    const result = await query;
    const rows = (result.data ?? []).flatMap((request) => {
      const player = request.players as unknown as { full_name: string; groups: { code: string } };
      const items = request.uniform_request_items as unknown as Array<{ size: string; quantity: number; uniform_catalog_items: { name: string } }>;
      return items.map((item) => ({ "Гравець": player.full_name, "Команда": player.groups.code, "Прізвище": request.surname_print ?? "", "Номер": request.number ?? "", "Позиція": item.uniform_catalog_items.name, "Розмір": item.size, "Кількість": item.quantity, "Стан": request.status }));
    });
    downloadText(`ЧЕМПІОН_${selectionFileLabel}_форма.csv`, toCsv(rows), "text/csv;charset=utf-8");
    await audit("uniform", { format: "csv" });
    setBusy(null);
  }

  async function exportOperations() {
    setBusy("operations");
    const start = new Date();
    start.setDate(start.getDate() - 30);
    let query = client.from("operational_items").select("created_at, group_id, item_type, status, title, comment, groups(code)").neq("item_type", "conflict").gte("created_at", start.toISOString());
    if (!allGroups) query = query.eq("group_id", groupId);
    const result = await query.order("created_at", { ascending: false });
    const rows = (result.data ?? []).map((item) => ({ "Дата": item.created_at, "Команда": (item.groups as unknown as { code: string })?.code ?? "", "Тип": item.item_type, "Стан": item.status, "Ситуація": item.title, "Коментар": item.comment ?? "" }));
    downloadText(`ЧЕМПІОН_${selectionFileLabel}_операційний_звіт.csv`, toCsv(rows), "text/csv;charset=utf-8");
    await audit("operations", { period_days: 30, format: "csv" });
    setBusy(null);
  }

  async function backup() {
    const passphrase = window.prompt("Задайте пароль резервної копії (щонайменше 12 символів). Збережіть його окремо: відновити втрачений пароль неможливо.");
    if (!passphrase) return;
    setBusy("backup");
    setMessage(null);
    try {
      const tables = ["profiles", "groups", "coach_group_assignments", "venues", "players", "guardians", "evaluation_metrics", "evaluation_metric_fields", "physical_test_sessions", "physical_test_results", "game_activity_results", "monthly_payments", "uniform_catalog_items", "uniform_requests", "uniform_request_items", "methodology_tasks", "terminology_entries", "training_structures", "training_structure_steps", "methodology_sections", "methodology_section_materials", "events", "attendance_sessions", "attendance_records", "operational_items", "inventory_items", "inventory_permissions", "inventory_adjustments", "announcements", "announcement_targets", "announcement_reads", "file_assets", "player_photos", "event_materials", "methodology_materials", "monthly_star_themes", "player_behavior_cards", "parent_contact_actions", "monthly_star_awards"];
      const data: Record<string, unknown> = { generated_at: new Date().toISOString(), club: "Клуб Чемпіон", schema_version: "1.4" };
      for (const table of tables) {
        const result = await client.from(table).select("*");
        if (result.error) throw new Error(`Помилка таблиці ${table}`);
        data[table] = result.data;
      }
      const encrypted = await encryptBackup(JSON.stringify(data), passphrase);
      downloadText(`ЧЕМПІОН_backup_${new Date().toISOString().slice(0, 10)}.encrypted.json`, JSON.stringify(encrypted), "application/json");
      await audit("backup", { tables: tables.length, format: "encrypted-json", cipher: encrypted.cipher });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Резервну копію не сформовано." });
    } finally {
      setBusy(null);
    }
  }

  const cards: Array<{ kind: ExportKind; title: string; description: string; actions: React.ReactNode }> = [
    { kind: "group", title: allGroups ? "Список усіх груп" : "Список команди", description: "Група, ПІБ, рік народження, амплуа та провідна нога.", actions: <><button onClick={() => void exportGroup("print")}><Printer />Друк / PDF</button><button onClick={() => void exportGroup("csv")}><Download />CSV</button></> },
    { kind: "player", title: "Профіль гравця", description: "Контакти, коротка характеристика тренера, тести та дозволені результати оцінювання.", actions: <button onClick={() => void exportPlayer()} disabled={!playerId}><Printer />Друк / PDF</button> },
    { kind: "tests", title: "Тестування фізичної підготовленості", description: "Первинні результати вибраних груп без автоматичного рейтингу.", actions: <><button onClick={() => void exportDataset("tests", "print")}><Printer />Друк / PDF</button><button onClick={() => void exportDataset("tests", "csv")}><Download />CSV</button></> },
    { kind: "activity", title: "Складові ігрової діяльності", description: "Структуровані результати вибраних груп без загальної оцінки 50/50.", actions: <><button onClick={() => void exportDataset("activity", "print")}><Printer />Друк / PDF</button><button onClick={() => void exportDataset("activity", "csv")}><Download />CSV</button></> },
    { kind: "monthly-star", title: "Нагороди «Зірка місяця»", description: "Один PDF: дві вертикальні нагороди A5 для переможців групи поруч на одному горизонтальному аркуші A4. Фото автоматично береться з профілю гравця.", actions: <><label className="export-month-field"><span>Місяць нагородження</span><input type="month" value={starMonth} onChange={(event) => setStarMonth(event.target.value)} /></label><button onClick={() => void exportMonthlyStars()} disabled={!starMonth || busy === "monthly-star"}><Download />Завантажити PDF A4</button></> },
    { kind: "debts", title: "Заборгованість гравців", description: "Лише гравці вибраних груп із несплатою за поточний або минулі місяці.", actions: <><button onClick={() => void exportDebts("print")}><Printer />Друк / PDF</button><button onClick={() => void exportDebts("csv")}><Download />CSV</button></> },
    { kind: "uniform", title: "Запити на форму", description: "Позиції, розміри, номери та стан підготовки у вибраних групах.", actions: <button onClick={() => void exportUniform()}><Download />CSV</button> },
    { kind: "operations", title: "План і загальний звіт", description: "Операційні ситуації вибраних груп за останні 30 днів.", actions: <button onClick={() => void exportOperations()}><Download />CSV</button> },
    { kind: "backup", title: "Адміністративна резервна копія", description: "JSON, зашифрований AES-256-GCM вашим паролем. Завжди містить усі дозволені дані.", actions: <button onClick={() => void backup()}><FileJson />Зашифрований JSON</button> },
  ];

  return <div className="workspace-stack">
    <WorkspaceHeader eyebrow="Друк і файли" title="Експорт" description="Файли містять дату формування, вибрані групи та назву клубу" actions={groups.length ? <GroupSelect groups={groups} value={groupId} onChange={setGroupId} allOption={{ value: ALL_GROUPS_VALUE, label: "Усі групи" }} /> : undefined} />
    {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
    <section className="export-player-select"><label><span>Гравець для профілю</span><select value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Оберіть гравця</option>{players.map((player) => <option value={player.id} key={player.id}>{player.full_name}{allGroups ? ` · ${playerGroupCode(player)}` : ""}</option>)}</select></label><Pill tone="plum">{selectionLabel}</Pill></section>
    {groups.length ? <div className="export-grid">{cards.map((card) => <article key={card.kind}><div><h2>{card.title}</h2><p>{card.description}</p></div><div className="export-actions">{card.actions}</div>{busy === card.kind && <small>Формування…</small>}</article>)}</div> : <EmptyState title="Групи не налаштовано" />}
  </div>;
}
