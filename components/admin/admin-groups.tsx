"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import Image from "next/image";
import { Boxes, CalendarDays, ChevronRight, ClipboardCheck, Pencil, UserRound, Users } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState, Modal, Pill, SearchField, StatusMessage, WorkspaceHeader } from "@/components/common/workspace-ui";
import { PlayerDetails } from "@/components/coach/coach-players";
import type { GroupSummary, InventoryItem, Player, UniformStatus } from "@/lib/domain/types";

interface GroupMetric extends GroupSummary {
  coachName: string;
  playerCount: number;
  trainingCount: number;
  attendancePercent: number | null;
}

interface AdminGroupPlayer extends Player {
  uniform_requests?: Array<{ id: string; status: UniformStatus }>;
  player_photos?: Array<{ file_assets?: { bucket: string; object_path: string } | null }>;
}

interface PaymentIndicator {
  currentPaid: boolean;
  hasPastDebt: boolean;
}

function groupCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "груп" : last === 1 ? "група" : last >= 2 && last <= 4 ? "групи" : "груп";
  return `${count} ${noun} школи`;
}

export function AdminGroups({ client, groups, onRefresh }: { client: SupabaseClient; groups: GroupSummary[]; onRefresh: () => void }) {
  const [metrics, setMetrics] = useState<GroupMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailsGroup, setDetailsGroup] = useState<GroupMetric | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<{ player: AdminGroupPlayer; photoUrl?: string } | null>(null);
  const [formatGroup, setFormatGroup] = useState<GroupSummary | null>(null);
  const [inventoryGroup, setInventoryGroup] = useState<GroupSummary | null>(null);

  const load = useCallback(async () => {
    if (!groups.length) { setMetrics([]); setLoading(false); return; }
    setLoading(true); setError(null);
    const emptyMetrics = groups.map((group) => ({ ...group, coachName: "Не призначено", playerCount: 0, trainingCount: 0, attendancePercent: null }));
    setMetrics(emptyMetrics);
    const ids = groups.map((group) => group.id);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart); monthEnd.setMonth(monthEnd.getMonth() + 1);
    const [players, events, assignments, attendance] = await Promise.all([
      client.from("players").select("id, group_id").in("group_id", ids).eq("is_active", true),
      client.from("events").select("id, group_id").in("group_id", ids).eq("event_type", "training").gte("start_at", monthStart.toISOString()).lt("start_at", monthEnd.toISOString()).neq("status", "cancelled"),
      client.from("coach_group_assignments").select("group_id, assignment_role, coach:profiles!coach_group_assignments_coach_id_fkey(full_name)").in("group_id", ids).eq("is_active", true),
      client.from("attendance_records").select("status, attendance_sessions!inner(event_id, completed_at, events!inner(group_id, start_at))").not("attendance_sessions.completed_at", "is", null).gte("attendance_sessions.events.start_at", monthStart.toISOString()).lt("attendance_sessions.events.start_at", monthEnd.toISOString()),
    ]);
    setLoading(false);
    const failedMetrics = [players.error, events.error, assignments.error, attendance.error].filter(Boolean).length;
    if (failedMetrics) setError("Усі групи відображено, але частину показників поки не вдалося обчислити.");
    const result = groups.map((group) => {
      const lead = (assignments.data ?? []).find((row) => row.group_id === group.id && row.assignment_role === "lead") as unknown as { coach?: { full_name: string } | null } | undefined;
      const records = (attendance.data ?? []).filter((row) => {
        const session = row.attendance_sessions as unknown as { events?: { group_id: string } | null };
        return session.events?.group_id === group.id;
      });
      const present = records.filter((row) => row.status === "present").length;
      return { ...group, coachName: lead?.coach?.full_name ?? "Не призначено", playerCount: (players.data ?? []).filter((row) => row.group_id === group.id).length, trainingCount: (events.data ?? []).filter((row) => row.group_id === group.id).length, attendancePercent: records.length ? Math.round((present / records.length) * 100) : null };
    });
    setMetrics(result);
  }, [client, groups]);
  useEffect(() => { void load(); }, [load]);

  return <div className="workspace-stack"><WorkspaceHeader eyebrow={groupCountLabel(groups.length)} title="Групи" description="Натисніть на групу, щоб переглянути склад команди та дані гравців" />{error && <StatusMessage kind="warning">{error}</StatusMessage>}{loading ? <LoadingState /> : metrics.length ? <div className="group-admin-grid">{metrics.map((group) => <article key={group.id} className="group-admin-card"><button type="button" className="group-card-main" onClick={() => setDetailsGroup(group)} aria-label={`Відкрити групу ${group.code}`}><header><div><span className="group-code">{group.code}</span><h2>{group.competition_format || (group.group_kind === "goalkeeper" ? "Спеціалізована підготовка воротарів" : "Формат не вказано")}</h2></div><ChevronRight aria-hidden="true" /></header><p className="coach-line"><Users size={17} />{group.coachName}</p><div className="group-metrics"><div><Users /><span><b>{group.playerCount}</b><small>гравців</small></span></div><div><CalendarDays /><span><b>{group.trainingCount}</b><small>тренувань</small></span></div><div><ClipboardCheck /><span><b>{group.attendancePercent === null ? "—" : `${group.attendancePercent}%`}</b><small>відвідування</small></span></div></div><span className="group-open-label">Відкрити групу<ChevronRight size={17} aria-hidden="true" /></span></button><div className="group-card-actions"><button type="button" className="secondary-action" onClick={() => setFormatGroup(group)}><Pencil size={17} />Формат</button><button type="button" className="secondary-action" onClick={() => setInventoryGroup(group)}><Boxes size={17} />Інвентар</button></div></article>)}</div> : <EmptyState title="Групи не створено" />}{detailsGroup && !selectedPlayer && <GroupDetailsModal client={client} group={detailsGroup} onClose={() => setDetailsGroup(null)} onPlayerOpen={(player, photoUrl) => setSelectedPlayer({ player, photoUrl })} />}{selectedPlayer && <PlayerDetails client={client} player={selectedPlayer.player} photoUrl={selectedPlayer.photoUrl} onClose={() => setSelectedPlayer(null)} />}{formatGroup && <GroupFormatModal client={client} group={formatGroup} onClose={() => setFormatGroup(null)} onSaved={() => { setFormatGroup(null); onRefresh(); void load(); }} />}{inventoryGroup && <GroupInventoryModal client={client} group={inventoryGroup} onClose={() => setInventoryGroup(null)} />}</div>;
}

function GroupDetailsModal({ client, group, onClose, onPlayerOpen }: { client: SupabaseClient; group: GroupMetric; onClose: () => void; onPlayerOpen: (player: AdminGroupPlayer, photoUrl?: string) => void }) {
  const [players, setPlayers] = useState<AdminGroupPlayer[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [paymentIndicators, setPaymentIndicators] = useState<Record<string, PaymentIndicator>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentWarning, setPaymentWarning] = useState<string | null>(null);
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const currentMonthName = new Intl.DateTimeFormat("uk-UA", { month: "long" }).format(new Date());

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setPaymentWarning(null);
    setPaymentIndicators({});
    void (async () => {
      const { data, error: loadError } = await client.from("players").select("id, group_id, full_name, first_name, last_name, middle_name, birth_date, birth_year, position, dominant_foot, coach_note, is_active, groups(code), uniform_requests(id, status), player_photos(file_assets(bucket, object_path))").eq("group_id", group.id).eq("is_active", true).order("full_name");
      if (!active) return;
      if (loadError) {
        setPlayers([]);
        setLoading(false);
        setError("Не вдалося завантажити склад групи.");
        return;
      }
      const next = (data ?? []) as unknown as AdminGroupPlayer[];
      setPlayers(next);
      const indicators = Object.fromEntries(next.map((player) => [player.id, { currentPaid: false, hasPastDebt: false }])) as Record<string, PaymentIndicator>;
      if (next.length) {
        const paymentResult = await client.from("monthly_payments").select("player_id, month, status").in("player_id", next.map((player) => player.id)).lte("month", currentMonth);
        if (!active) return;
        if (paymentResult.error) {
          setPaymentWarning("Статуси оплат тимчасово недоступні.");
        } else {
          for (const row of paymentResult.data ?? []) {
            const indicator = indicators[row.player_id];
            if (!indicator) continue;
            if (row.month === currentMonth) indicator.currentPaid = row.status === "paid";
            if (row.month < currentMonth && row.status === "unpaid") indicator.hasPastDebt = true;
          }
          setPaymentIndicators(indicators);
        }
      } else {
        setPaymentIndicators({});
      }
      const urls: Record<string, string> = {};
      await Promise.all(next.map(async (player) => {
        const asset = player.player_photos?.[0]?.file_assets;
        if (!asset) return;
        const signed = await client.storage.from(asset.bucket).createSignedUrl(asset.object_path, 600, { transform: { width: 160, height: 160, resize: "cover" } });
        if (signed.data?.signedUrl) urls[player.id] = signed.data.signedUrl;
      }));
      if (!active) return;
      setPhotoUrls(urls);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [client, currentMonth, group.id]);

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("uk-UA");
    return query ? players.filter((player) => `${player.full_name} ${player.position ?? ""}`.toLocaleLowerCase("uk-UA").includes(query)) : players;
  }, [players, search]);

  return <Modal title={`Група · ${group.code}`} onClose={onClose} wide footer={<button className="primary-action" type="button" onClick={onClose}>Закрити</button>}>
    <div className="group-detail-head"><div><Pill tone="plum">{group.group_kind === "goalkeeper" ? "Воротарська група" : "Вікова команда"}</Pill><h3>{group.competition_format || "Формат не вказано"}</h3><p className="coach-line"><Users size={17} />{group.coachName}</p></div><div className="group-metrics group-detail-metrics"><div><Users /><span><b>{group.playerCount}</b><small>гравців</small></span></div><div><CalendarDays /><span><b>{group.trainingCount}</b><small>тренувань цього місяця</small></span></div><div><ClipboardCheck /><span><b>{group.attendancePercent === null ? "—" : `${group.attendancePercent}%`}</b><small>відвідування</small></span></div></div></div>
    {(group.regulation_source || group.regulation_verified_on) && <section className="profile-section"><h3>Регламент і формат</h3><div className="detail-list">{group.regulation_source && <div><ClipboardCheck /><span><b>Джерело регламенту</b><small>{group.regulation_source}</small></span></div>}{group.regulation_verified_on && <div><CalendarDays /><span><b>Дата перевірки</b><small>{new Date(group.regulation_verified_on).toLocaleDateString("uk-UA")}</small></span></div>}</div></section>}
    <section className="profile-section group-roster"><div className="section-title-row"><div><p className="eyebrow">Склад команди</p><h3>Гравці групи</h3></div><Pill tone="neutral">{players.length}</Pill></div>
      {error && <StatusMessage kind="error">{error}</StatusMessage>}
      {paymentWarning && <StatusMessage kind="warning">{paymentWarning}</StatusMessage>}
      {loading ? <LoadingState label="Завантажуємо гравців…" /> : players.length ? <><SearchField value={search} onChange={setSearch} placeholder="Пошук за прізвищем або амплуа" />{filteredPlayers.length ? <div className="player-grid group-player-grid">{filteredPlayers.map((player) => {
        const issued = player.uniform_requests?.some((request) => request.status === "issued");
        const payment = paymentIndicators[player.id];
        return <button className="player-card" type="button" key={player.id} onClick={() => onPlayerOpen(player, photoUrls[player.id])}>{photoUrls[player.id] ? <Image unoptimized width={64} height={64} src={photoUrls[player.id]} alt="" /> : <span className="avatar-placeholder"><UserRound /></span>}<div><h2>{player.full_name}</h2><p>{player.birth_date ? new Date(player.birth_date).getFullYear() : player.birth_year ?? "Рік не вказано"} · {player.position || "Амплуа не вказано"}</p><div className="player-card-pills"><Pill tone={issued ? "success" : "warning"}>{issued ? "Формою забезпечено" : "Форма не видана"}</Pill>{payment && !payment.currentPaid && <Pill tone="danger">Не сплачено за {currentMonthName}</Pill>}{payment?.hasPastDebt && <Pill tone="danger">Є заборгованість</Pill>}</div></div><ChevronRight aria-hidden="true" /></button>;
      })}</div> : <EmptyState title="Гравців за цим запитом не знайдено" />}</> : <EmptyState title="У цій групі ще немає гравців">Група залишається активною і доступною для призначення тренера.</EmptyState>}
    </section>
  </Modal>;
}

function GroupFormatModal({ client, group, onClose, onSaved }: { client: SupabaseClient; group: GroupSummary; onClose: () => void; onSaved: () => void }) {
  const [format, setFormat] = useState(group.competition_format ?? "");
  const [source, setSource] = useState(group.regulation_source ?? "");
  const [verified, setVerified] = useState(group.regulation_verified_on ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); const result = await client.from("groups").update({ competition_format: format || null, regulation_source: source || null, regulation_verified_on: verified || null }).eq("id", group.id); setBusy(false); if (result.error) { setError("Формат не збережено."); return; } onSaved(); }
  return <Modal title={`${group.group_kind === "goalkeeper" ? "Формат роботи" : "Формат змагань"} · ${group.code}`} onClose={onClose} footer={<><button type="button" className="secondary-action" onClick={onClose}>Скасувати</button><button form="group-format" className="primary-action" disabled={busy}>Зберегти</button></>}><form id="group-format" className="form-stack" onSubmit={save}><label><span>Робочий формат</span><input value={format} onChange={(e) => setFormat(e.target.value)} placeholder={group.group_kind === "goalkeeper" ? "Наприклад, техніка воротаря" : "Наприклад, 6+1"} /></label><label><span>Джерело регламенту</span><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Назва або посилання на регламент" /></label><label><span>Дата перевірки</span><input type="date" value={verified} onChange={(e) => setVerified(e.target.value)} /></label><p className="muted">Призначення тренера змінюється лише у «Керування → Користувачі й паролі».</p>{error && <StatusMessage kind="error">{error}</StatusMessage>}</form></Modal>;
}

function GroupInventoryModal({ client, group, onClose }: { client: SupabaseClient; group: GroupSummary; onClose: () => void }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void client.from("inventory_items").select("id, group_id, name, quantity, damaged, lost, needed, is_active").eq("group_id", group.id).eq("is_active", true).order("name").then(({ data }) => { setItems((data ?? []) as InventoryItem[]); setLoading(false); }); }, [client, group.id]);
  return <Modal title={`Інвентар · ${group.code}`} onClose={onClose} footer={<button className="primary-action" type="button" onClick={onClose}>Закрити</button>}>{loading ? <LoadingState /> : items.length ? <div className="responsive-table"><table><thead><tr><th>Позиція</th><th>Кількість</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.quantity} шт.</td></tr>)}</tbody></table></div> : <EmptyState title="Інвентар не внесено" />}<p className="muted modal-note">Це лише перегляд. Редагування виконується у «Керування → Інвентар» або тренером за дозволом.</p></Modal>;
}
