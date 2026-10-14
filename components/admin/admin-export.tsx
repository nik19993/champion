"use client";

import { OPERATIONAL_REPORT_SELECT, operationalReportRow } from "@/lib/domain/operational-report";

import { groupCode, groupLabel } from "@/lib/domain/seasons";
import { firstRelation } from "@/lib/domain/operational-report";
import { createPlayerProfilePdf } from "@/lib/domain/player-profile-pdf";
import { assessmentLabel, playerProfileHistory, profileExportRange, type ProfileExportFilter, type ProfilePhysicalResult, type ProfileActivityResult } from "@/lib/domain/player-profile-report";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Download, FileJson } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, GroupSelect, Pill, StatusMessage, WorkspaceHeader } from "@/components/common/workspace-ui";
import { encryptBackup } from "@/lib/domain/backup";
import { collectApplicationBackup, APPLICATION_BACKUP_TABLES } from "@/lib/domain/application-backup";
import { downloadBlob, downloadText, formatDate, formatMonth, toCsv, toMonthInput } from "@/lib/domain/format";
import { createMonthlyStarAwardPdf } from "@/lib/domain/monthly-star-award-pdf";
import { createTableReportPdf } from "@/lib/domain/report-pdf";
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

function playerGroupCode(player: Player) {
  return groupCode(player.groups);
}

export function AdminExport({ client, profile, groups }: Props) {
  const [groupId, setGroupId] = useState(ALL_GROUPS_VALUE);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [starMonth, setStarMonth] = useState(() => toMonthInput());
  const [profilePeriod, setProfilePeriod] = useState<ProfileExportFilter["mode"]>("all");
  const [profileYear, setProfileYear] = useState(() => String(new Date().getFullYear()));
  const [profileFrom, setProfileFrom] = useState("");
  const [profileTo, setProfileTo] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const allGroups = groupId === ALL_GROUPS_VALUE;
  const group = groups.find((item) => item.id === groupId);
  const selectionLabel = allGroups ? "Усі групи" : group ? groupCode(group) : "Група";
  const selectionFileLabel = allGroups ? "усі_групи" : group ? groupCode(group) : "група";

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
        .select("id, group_id, full_name, birth_date, birth_year, position, dominant_foot, coach_note, coach_note_author_id, coach_note_author_name, coach_note_updated_at, is_active, groups(code, display_code, cohort_birth_year, season)")
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

  async function exportGroup(format: "csv" | "pdf") {
    setBusy("group");
    setMessage(null);
    try {
      const rows = players.map((player) => ({
        "Група": playerGroupCode(player),
        "ПІБ": player.full_name,
        "Дата народження": player.birth_date ? formatDate(player.birth_date) : "",
        "Рік народження": player.birth_date ? new Date(player.birth_date).getFullYear() : player.birth_year ?? "",
        "Амплуа": player.position ?? "",
        "Провідна нога": player.dominant_foot ?? "",
      }));
      if (format === "csv") {
        downloadText(`ЧЕМПІОН_${selectionFileLabel}_гравці.csv`, toCsv(rows), "text/csv;charset=utf-8");
      } else {
        const pdf = await createTableReportPdf({
          title: allGroups ? "Список гравців усіх груп" : `Список команди ${selectionLabel}`,
          subtitle: selectionLabel,
          headers: ["Група", "ПІБ", "Дата народження", "Рік народження", "Амплуа", "Провідна нога"],
          rows: rows.map(Object.values),
          columnWeights: [0.8, 2.1, 1.2, 1.1, 1.3, 1.2],
          emptyMessage: "Дані не внесено",
        });
        downloadBlob(`ЧЕМПІОН_${selectionFileLabel}_гравці.pdf`, pdf);
        setMessage({ kind: "success", text: "PDF зі списком гравців завантажено." });
      }
      await audit("group", { format, rows: rows.length });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "PDF не сформовано." });
    } finally {
      setBusy(null);
    }
  }

  async function exportPlayer() {
    const player = players.find((item) => item.id === playerId);
    if (!player || busy) return;
    const filter: ProfileExportFilter = { mode: profilePeriod, year: profileYear, from: profileFrom, to: profileTo };
    try { profileExportRange(filter); } catch (error) { setMessage({ kind: "error", text: (error as Error).message }); return; }
    setBusy("player");
    setMessage(null);
    try {
      // Paginate the complete history rather than accepting the Data API's first 1000 rows.
      async function historyRows(table: "physical_test_results" | "game_activity_results", fields: string, order: string) {
        const rows: unknown[] = [];
        for (let offset = 0; ; offset += 1000) {
          const result = await client.from(table).select(fields).eq("player_id", player!.id).order(order, { ascending: true }).order("id", { ascending: true }).range(offset, offset + 999);
          if (result.error) throw new Error("Не вдалося завантажити історію результатів для PDF.");
          rows.push(...(result.data ?? []));
          if ((result.data ?? []).length < 1000) return rows;
        }
      }
      const [guardianResult, tests, activity, photoResult] = await Promise.all([
        client.from("guardians").select("full_name, relation, phone, email").eq("player_id", player.id),
        historyRows("physical_test_results", "measured_on, metric_name, field_name, value, unit", "measured_on"),
        historyRows("game_activity_results", "period, metric_name, value", "period"),
        Promise.resolve(client.from("player_photos").select("file_assets!inner(bucket, object_path, scan_status)").eq("player_id", player.id).eq("is_current", true).eq("file_assets.scan_status", "clean").maybeSingle()).catch(() => ({ data: null, error: { message: "Photo unavailable" } })),
      ]);
      if (guardianResult.error) throw new Error("Контакти профілю для PDF не завантажено.");
      const guardians = guardianResult.data ?? [];
      let photo: Blob | null = null;
      let photoWarning = Boolean(photoResult.error);
      const asset = firstRelation((photoResult.data as unknown as { file_assets?: CurrentPhotoRow["file_assets"] | CurrentPhotoRow["file_assets"][] } | null)?.file_assets);
      if (asset?.scan_status === "clean") {
        try { const download = await client.storage.from(asset.bucket).download(asset.object_path); photo = download.data; photoWarning ||= Boolean(download.error || !photo); }
        catch { photoWarning = true; }
      }
      const history = playerProfileHistory(tests as ProfilePhysicalResult[], activity as ProfileActivityResult[], filter);
      const playerGroup = firstRelation(player.groups);
      const { pdf, photoUnavailable, emblemUnavailable } = await createPlayerProfilePdf({
        fullName: player.full_name,
        details: [
          ["Дата народження", player.birth_date ? assessmentLabel(player.birth_date) : player.birth_year ? `${player.birth_year} р.н. (повна дата невідома)` : "Не внесено"],
          ["Група", playerGroup ? groupLabel(playerGroup) : "Не вказано"],
          ["Амплуа", player.position || "Не внесено"],
          ["Сезон", playerGroup?.season || "Не вказано"],
          ["Провідна нога", player.dominant_foot || "Не внесено"],
        ],
        coachNote: player.coach_note || "Характеристику не внесено.",
        coachNoteAt: player.coach_note_updated_at ? formatDate(player.coach_note_updated_at) : undefined,
        coachNoteAuthor: player.coach_note_author_name ?? undefined,
        rangeLabel: history.range.label, history, photo,
        guardians: guardians.map((guardian) => [guardian.relation, guardian.full_name, guardian.phone, guardian.email].filter(Boolean).join(" · ")),
      });
      downloadBlob(`ЧЕМПІОН_профіль_${player.full_name}.pdf`, pdf);
      await audit("player", { player_id: player.id, format: "pdf", period: history.range.label });
      const warnings = [photoWarning || photoUnavailable ? "Фото тимчасово недоступне." : "", emblemUnavailable ? "Емблема тимчасово недоступна." : "", history.undatedExcluded ? "Записи без точної дати доступні в режимі «Уся історія»." : ""].filter(Boolean);
      setMessage({ kind: warnings.length ? "warning" : "success", text: `PDF профілю ${player.full_name} завантажено.${warnings.length ? ` ${warnings.join(" ")}` : ""}` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "PDF профілю не сформовано." });
    } finally {
      setBusy(null);
    }
  }

  async function exportDataset(kind: "tests" | "activity", format: "csv" | "pdf") {
    setBusy(kind);
    setMessage(null);
    try {
      let query = kind === "tests"
        ? client.from("physical_test_results").select("measured_on, metric_name, field_name, value, unit, players!inner(full_name, birth_date, birth_year, group_id, groups!inner(code, display_code, cohort_birth_year, season))")
        : client.from("game_activity_results").select("period, metric_name, value, players!inner(full_name, birth_date, birth_year, group_id, groups!inner(code, display_code, cohort_birth_year, season))");
      if (!allGroups) query = query.eq("players.group_id", groupId);
      const result = await query;
      if (result.error) throw new Error("Не вдалося сформувати експорт.");
      const raw = (result.data ?? []) as unknown as Array<{
        measured_on?: string;
        period?: string;
        metric_name: string;
        field_name?: string;
        value: string;
        unit?: string | null;
        players: { full_name: string; birth_date: string | null; birth_year: number | null; groups: { code: string; display_code?: string | null } };
      }>;
      const rows = raw.map((row) => kind === "tests"
        ? { "Група": groupCode(row.players.groups), "Гравець": row.players.full_name, "Дата народження": row.players.birth_date ? formatDate(row.players.birth_date) : "", "Рік народження": row.players.birth_year ?? "", "Дата": row.measured_on ?? "", "Тест": row.metric_name, "Поле результату": row.field_name ?? "", "Значення": row.value, "Одиниця": row.unit ?? "" }
        : { "Група": groupCode(row.players.groups), "Гравець": row.players.full_name, "Дата народження": row.players.birth_date ? formatDate(row.players.birth_date) : "", "Рік народження": row.players.birth_year ?? "", "Період": row.period ?? "", "Показник": row.metric_name, "Значення": row.value });
      if (format === "csv") {
        downloadText(`ЧЕМПІОН_${selectionFileLabel}_${kind}.csv`, toCsv(rows), "text/csv;charset=utf-8");
      } else {
        const isTests = kind === "tests";
        const pdf = await createTableReportPdf({
          title: isTests ? "Тестування фізичної підготовленості" : "Складові ігрової діяльності",
          subtitle: selectionLabel,
          headers: isTests
            ? ["Група", "Гравець", "Дата народження", "Рік народження", "Дата", "Тест", "Поле результату", "Значення", "Одиниця"]
            : ["Група", "Гравець", "Дата народження", "Рік народження", "Період", "Показник", "Значення"],
          rows: rows.map(Object.values),
          columnWeights: isTests ? [0.8, 1.8, 1.1, 1.0, 1.1, 1.5, 1.5, 0.9, 0.8] : [0.8, 1.8, 1.1, 1.0, 1.1, 2.2, 0.9],
          emptyMessage: "Дані не внесено",
        });
        downloadBlob(`ЧЕМПІОН_${selectionFileLabel}_${kind}.pdf`, pdf);
        setMessage({ kind: "success", text: rows.length ? "PDF-звіт завантажено." : "PDF-звіт завантажено з повідомленням «Дані не внесено»." });
      }
      await audit(kind, { format, rows: rows.length });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "PDF-звіт не сформовано." });
    } finally {
      setBusy(null);
    }
  }

  async function exportDebts(format: "csv" | "pdf") {
    setBusy("debts");
    setMessage(null);
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      let playerQuery = client.from("players").select("id, full_name, group_id, groups(code, display_code, cohort_birth_year, season)").eq("is_active", true);
      if (!allGroups) playerQuery = playerQuery.eq("group_id", groupId);
      const playerResult = await playerQuery.order("full_name");
      if (playerResult.error) throw new Error("Не вдалося завантажити гравців для звіту.");
      const debtPlayers = (playerResult.data ?? []) as unknown as Array<{ id: string; full_name: string; groups: { code: string } }>;
      const paymentResult = debtPlayers.length
        ? await client.from("monthly_payments").select("player_id, month, status").in("player_id", debtPlayers.map((player) => player.id)).lte("month", currentMonth).order("month", { ascending: false })
        : { data: [], error: null };
      if (paymentResult.error) throw new Error("Не вдалося завантажити дані про заборгованість.");
      const payments = paymentResult.data ?? [];
      const rows = debtPlayers.flatMap((player) => {
        const playerPayments = payments.filter((payment) => payment.player_id === player.id);
        const unpaidMonths = new Set(playerPayments.filter((payment) => payment.status === "unpaid").map((payment) => payment.month));
        const currentPayment = playerPayments.find((payment) => payment.month === currentMonth);
        if (!currentPayment || currentPayment.status === "unpaid") unpaidMonths.add(currentMonth);
        const months = [...unpaidMonths].sort().reverse();
        if (!months.length) return [];
        return [{
          "Група": groupCode(player.groups),
          "Гравець": player.full_name,
          "Неоплачені місяці": months.map((month) => formatMonth(month.slice(0, 7))).join("; "),
          "Кількість неоплачених місяців": months.length,
          "Поточний місяць": months.includes(currentMonth) ? "Не сплачено" : "Сплачено",
          "Борг за минулі місяці": months.some((month) => month < currentMonth) ? "Так" : "Ні",
        }];
      });
      if (format === "csv") {
        downloadText(`ЧЕМПІОН_${selectionFileLabel}_заборгованість.csv`, toCsv(rows), "text/csv;charset=utf-8");
      } else {
        const pdf = await createTableReportPdf({
          title: "Заборгованість гравців",
          subtitle: `${selectionLabel} · станом на ${formatMonth(currentMonth.slice(0, 7))}`,
          headers: ["Група", "Гравець", "Неоплачені місяці", "К-сть", "Поточний місяць", "Минулий борг"],
          rows: rows.map(Object.values),
          columnWeights: [0.8, 1.7, 2.4, 0.8, 1.2, 1.1],
          emptyMessage: debtPlayers.length ? "Заборгованостей немає" : "Дані не внесено",
        });
        downloadBlob(`ЧЕМПІОН_${selectionFileLabel}_заборгованість.pdf`, pdf);
      }
      await audit("debts", { format, players: rows.length, through_month: currentMonth });
      setMessage({
        kind: "success",
        text: format === "pdf"
          ? (rows.length ? "PDF зі заборгованостями завантажено." : debtPlayers.length ? "PDF завантажено: заборгованостей немає." : "PDF завантажено з повідомленням «Дані не внесено».")
          : rows.length ? "CSV зі заборгованостями завантажено." : "CSV сформовано без записів.",
      });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Звіт про заборгованість не сформовано." });
    } finally {
      setBusy(null);
    }
  }

  async function exportMonthlyStars() {
    setBusy("monthly-star");
    setMessage(null);
    try {
      let awardQuery = client
        .from("monthly_star_awards")
        .select("player_id, players!inner(id, full_name), groups!inner(code, display_code, cohort_birth_year, season), monthly_star_themes!inner(title)")
        .eq("month", `${starMonth}-01`)
        .is("revoked_at", null);
      if (!allGroups) awardQuery = awardQuery.eq("group_id", groupId);
      const awardResult = await awardQuery;
      if (awardResult.error) throw new Error("Не вдалося завантажити перелік нагороджених гравців.");

      const awards = ((awardResult.data ?? []) as unknown as MonthlyStarExportRow[]).sort((left, right) => (
        groupCode(left.groups).localeCompare(groupCode(right.groups), "uk-UA")
        || left.players.full_name.localeCompare(right.players.full_name, "uk-UA")
      ));
      if (!awards.length) {
        const pdf = await createTableReportPdf({
          title: "Нагороди «Зірка місяця»",
          subtitle: `${formatMonth(starMonth)} · ${selectionLabel}`,
          headers: ["Стан"],
          rows: [],
          emptyMessage: "Дані не внесено",
        });
        downloadBlob(`ЧЕМПІОН_Зірка_місяця_${starMonth}_${selectionFileLabel}_звіт.pdf`, pdf);
        await audit("monthly-star", { month: `${starMonth}-01`, format: "pdf-empty", awards: 0, sheets: 1 });
        setMessage({ kind: "success", text: "PDF завантажено з повідомленням «Дані не внесено»." });
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
        const playersWithoutPhotos = [...new Set(missingPhotoAwards.map((award) => `${award.players.full_name} (${groupCode(award.groups)})`))];
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
        const playerNames = [...new Set(unavailablePhotos.map(({ award }) => `${award.players.full_name} (${groupCode(award.groups)})`))];
        setMessage({ kind: "error", text: `PDF не сформовано. Не вдалося завантажити фото: ${playerNames.join(", ")}. Перевірте фото у профілі.` });
        return;
      }

      const pdf = await createMonthlyStarAwardPdf(downloadedPhotos.map(({ award, photo }) => ({
        fullName: award.players.full_name,
        groupCode: groupCode(award.groups),
        themeTitle: award.monthly_star_themes.title,
        photo: photo!,
      })));
      const awardCountsByGroup = awards.reduce((counts, award) => counts.set(groupCode(award.groups), (counts.get(groupCode(award.groups)) ?? 0) + 1), new Map<string, number>());
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
    let query = client.from("uniform_requests").select("status, number, surname_print, admin_note, players!inner(full_name, group_id, groups!inner(id, code, display_code, cohort_birth_year, season)), uniform_request_items(size, quantity, uniform_catalog_items(name))");
    if (!allGroups) query = query.eq("players.group_id", groupId);
    const result = await query;
    const rows = (result.data ?? []).flatMap((request) => {
      const player = request.players as unknown as { full_name: string; groups: { code: string } };
      const items = request.uniform_request_items as unknown as Array<{ size: string; quantity: number; uniform_catalog_items: { name: string } }>;
      return items.map((item) => ({ "Гравець": player.full_name, "Команда": groupCode(player.groups), "Прізвище": request.surname_print ?? "", "Номер": request.number ?? "", "Позиція": item.uniform_catalog_items.name, "Розмір": item.size, "Кількість": item.quantity, "Стан": request.status }));
    });
    downloadText(`ЧЕМПІОН_${selectionFileLabel}_форма.csv`, toCsv(rows), "text/csv;charset=utf-8");
    await audit("uniform", { format: "csv" });
    setBusy(null);
  }

  async function exportOperations() {
    if (busy === "operations") return;
    setBusy("operations"); setMessage(null);
    try {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      let query = client.from("operational_items").select(OPERATIONAL_REPORT_SELECT).neq("item_type", "conflict").gte("created_at", start.toISOString());
      if (!allGroups) query = query.eq("group_id", groupId);
      const result = await query.order("created_at", { ascending: false });
      if (result.error) throw result.error;
      const rows = (result.data ?? []).map((item) => { const row = operationalReportRow(item as unknown as import("@/lib/domain/types").OperationalItem); return { "Дата": row.date, "Вікова група": row.group, "Тренер": row.coach, "Що потрібно зробити / коментар": row.action, "Подія / ситуація": row.context, "Стан": row.status }; });
      downloadText(`ЧЕМПІОН_${selectionFileLabel}_операційний_звіт.csv`, toCsv(rows), "text/csv;charset=utf-8");
      await audit("operations", { period_days: 30, format: "csv" });
    } catch {
      setMessage({ kind: "error", text: "Не вдалося сформувати звіт. Перевірте з’єднання й повторіть спробу." });
    } finally { setBusy(null); }
  }

  async function backup() {
    const passphrase = window.prompt("Задайте пароль резервної копії (щонайменше 12 символів). Збережіть його окремо: відновити втрачений пароль неможливо.");
    if (!passphrase) return;
    if (passphrase.length < 12) { setMessage({ kind: "error", text: "Пароль резервної копії має містити щонайменше 12 символів." }); return; }
    setBusy("backup");
    setMessage(null);
    try {
      const data = await collectApplicationBackup(client, profile.id);
      const encrypted = await encryptBackup(JSON.stringify(data), passphrase);
      downloadText(`ЧЕМПІОН_backup_${new Date().toISOString().slice(0, 10)}.encrypted.json`, JSON.stringify(encrypted), "application/json");
      await audit("backup", { tables: APPLICATION_BACKUP_TABLES.length, format: "encrypted-json", cipher: encrypted.cipher });
      setMessage({ kind: "success", text: "Зашифровану копію даних застосунку завантажено. Файли й облікові записи потребують окремої резервної копії." });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Резервну копію не сформовано." });
    } finally {
      setBusy(null);
    }
  }

  const cards: Array<{ kind: ExportKind; title: string; description: string; actions: React.ReactNode }> = [
    { kind: "group", title: allGroups ? "Список усіх груп" : "Список команди", description: "Група, ПІБ, рік народження, амплуа та провідна нога.", actions: <><button onClick={() => void exportGroup("pdf")} disabled={busy === "group"}><Download />Завантажити PDF</button><button onClick={() => void exportGroup("csv")} disabled={busy === "group"}><Download />CSV</button></> },
    { kind: "player", title: "Профіль гравця", description: "Фото, характеристика тренера та динаміка результатів за датами. Контакти батьків збережено.", actions: <><div className="profile-export-period"><label><span>Період профілю</span><select aria-label="Період профілю" value={profilePeriod} onChange={(event) => setProfilePeriod(event.target.value as ProfileExportFilter["mode"])}><option value="all">Уся історія</option><option value="year">Окремий рік</option><option value="range">Діапазон дат</option></select></label>{profilePeriod === "year" && <label><span>Рік результатів</span><input aria-label="Рік результатів" type="number" min={1900} max={2199} value={profileYear} onChange={(event) => setProfileYear(event.target.value)} /></label>}{profilePeriod === "range" && <><label><span>Від дати</span><input aria-label="Від дати" type="date" value={profileFrom} onChange={(event) => setProfileFrom(event.target.value)} /></label><label><span>До дати</span><input aria-label="До дати" type="date" value={profileTo} onChange={(event) => setProfileTo(event.target.value)} /></label></>}</div><button onClick={() => void exportPlayer()} disabled={!playerId || busy === "player"}><Download />Завантажити PDF</button></> },
    { kind: "tests", title: "Тестування фізичної підготовленості", description: "Первинні результати вибраних груп без автоматичного рейтингу.", actions: <><button onClick={() => void exportDataset("tests", "pdf")} disabled={busy === "tests"}><Download />Завантажити PDF</button><button onClick={() => void exportDataset("tests", "csv")} disabled={busy === "tests"}><Download />CSV</button></> },
    { kind: "activity", title: "Складові ігрової діяльності", description: "Структуровані результати вибраних груп без загальної оцінки 50/50.", actions: <><button onClick={() => void exportDataset("activity", "pdf")} disabled={busy === "activity"}><Download />Завантажити PDF</button><button onClick={() => void exportDataset("activity", "csv")} disabled={busy === "activity"}><Download />CSV</button></> },
    { kind: "monthly-star", title: "Нагороди «Зірка місяця»", description: "Один PDF: дві вертикальні нагороди A5 для переможців групи поруч на одному горизонтальному аркуші A4. Фото автоматично береться з профілю гравця.", actions: <><label className="export-month-field"><span>Місяць нагородження</span><input type="month" value={starMonth} onChange={(event) => setStarMonth(event.target.value)} /></label><button onClick={() => void exportMonthlyStars()} disabled={!starMonth || busy === "monthly-star"}><Download />Завантажити PDF A4</button></> },
    { kind: "debts", title: "Заборгованість гравців", description: "Лише гравці вибраних груп із несплатою за поточний або минулі місяці.", actions: <><button onClick={() => void exportDebts("pdf")} disabled={busy === "debts"}><Download />Завантажити PDF</button><button onClick={() => void exportDebts("csv")} disabled={busy === "debts"}><Download />CSV</button></> },
    { kind: "uniform", title: "Запити на форму", description: "Позиції, розміри, номери та стан підготовки у вибраних групах.", actions: <button onClick={() => void exportUniform()}><Download />CSV</button> },
    { kind: "operations", title: "План і загальний звіт", description: "Операційні ситуації вибраних груп за останні 30 днів.", actions: <button onClick={() => void exportOperations()}><Download />CSV</button> },
    { kind: "backup", title: "Адміністративна резервна копія", description: "Зашифрована копія даних застосунку. Файли та облікові записи зберігаються окремо.", actions: <button onClick={() => void backup()} disabled={busy !== null}><FileJson />Зашифрований JSON</button> },
  ];

  return <div className="workspace-stack">
    <WorkspaceHeader eyebrow="Друк і файли" title="Експорт" description="Файли містять дату формування, вибрані групи та назву клубу" actions={groups.length ? <GroupSelect groups={groups} value={groupId} onChange={setGroupId} allOption={{ value: ALL_GROUPS_VALUE, label: "Усі групи" }} /> : undefined} />
    {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
    <section className="export-player-select"><label><span>Гравець для профілю</span><select value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Оберіть гравця</option>{players.map((player) => <option value={player.id} key={player.id}>{player.full_name}{allGroups ? ` · ${playerGroupCode(player)}` : ""}</option>)}</select></label><Pill tone="plum">{selectionLabel}</Pill></section>
    {groups.length ? <div className="export-grid">{cards.map((card) => <article key={card.kind}><div><h2>{card.title}</h2><p>{card.description}</p></div><div className="export-actions">{card.actions}</div>{busy === card.kind && <small>Формування…</small>}</article>)}</div> : <EmptyState title="Групи не налаштовано" />}
  </div>;
}
