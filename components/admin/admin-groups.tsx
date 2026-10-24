"use client";
import { eventVenueLabel } from "@/lib/domain/venue-booking";

import type { SupabaseClient } from "@supabase/supabase-js";
import Image from "next/image";
import { Boxes, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, List, MapPin, Pencil, UserRound, Users } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState, Modal, Pill, SearchField, StatusMessage, WorkspaceHeader } from "@/components/common/workspace-ui";
import { SeasonManagement } from "@/components/admin/season-management";
import { groupCode, groupLabel } from "@/lib/domain/seasons";
import { PlayerDetails } from "@/components/coach/coach-players";
import { EVENT_LABELS, formatDate, formatTime, kyivDateKey, kyivMonthBounds } from "@/lib/domain/format";
import type { EventType, GroupSummary, InventoryItem, Player, Profile, UniformStatus } from "@/lib/domain/types";

interface GroupMetric extends GroupSummary {
  coachName: string;
  playerCount: number;
  trainingCount: number;
  attendancePercent: number | null;
}

interface AdminGroupPlayer extends Player {
  uniform_requests?: Relation<{ id: string; status: UniformStatus }>;
  player_photos?: Array<{ is_current: boolean; file_assets?: { bucket: string; object_path: string } | null }>;
}

interface PaymentIndicator {
  currentPaid: boolean;
  hasPastDebt: boolean;
}

type Relation<T> = T | T[] | null;

interface AdminGroupEvent {
  id: string;
  event_type: EventType;
  start_at: string;
  duration_minutes: number;
  status: "scheduled" | "cancelled" | "completed";
  title?: string | null;
  notes?: string | null;
  organizational_need?: string | null;
  coach?: Relation<{ full_name: string }>;
  venue_part?: "whole" | "left" | "right";
  venues?: Relation<{ name: string; parent_venue_id?: string | null }>;
  methodology_tasks?: Relation<{ title: string }>;
}

const EVENT_STATUS_LABELS: Record<AdminGroupEvent["status"], string> = {
  scheduled: "Заплановано",
  cancelled: "Скасовано",
  completed: "Завершено",
};

function relationOne<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const leading = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ];
}

function sameCalendarDay(date: Date, value: string) {
  const cellKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return cellKey === kyivDateKey(value);
}

function groupCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14 ? "груп" : last === 1 ? "група" : last >= 2 && last <= 4 ? "групи" : "груп";
  return `${count} ${noun} клубу`;
}

export function AdminGroups({ client, profile, groups, onRefresh }: { client: SupabaseClient; profile: Profile; groups: GroupSummary[]; onRefresh: () => void }) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [rosterVersion, setRosterVersion] = useState(0);
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
    const emptyMetrics = groups.map((group) => ({ ...group, coachName: "Тренера не призначено", playerCount: 0, trainingCount: 0, attendancePercent: null }));
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
      const lead = (assignments.data ?? []).find((row) => row.group_id === group.id && row.assignment_role === "lead") as unknown as { coach?: Relation<{ full_name: string }> } | undefined;
      const records = (attendance.data ?? []).filter((row) => {
        const session = relationOne(row.attendance_sessions as unknown as Relation<{ events?: Relation<{ group_id: string }> }>);
        return relationOne(session?.events)?.group_id === group.id;
      });
      const present = records.filter((row) => row.status === "present").length;
      return { ...group, coachName: relationOne(lead?.coach)?.full_name ?? "Тренера не призначено", playerCount: (players.data ?? []).filter((row) => row.group_id === group.id).length, trainingCount: (events.data ?? []).filter((row) => row.group_id === group.id).length, attendancePercent: records.length ? Math.round((present / records.length) * 100) : null };
    });
    setMetrics(result);
  }, [client, groups]);
  useEffect(() => { void load(); }, [load]);

  return <div className="workspace-stack"><WorkspaceHeader eyebrow={groupCountLabel(groups.length)} title="Групи" description="Натисніть на групу, щоб переглянути склад команди та дані гравців" actions={<button type="button" className="secondary-action" onClick={() => setArchiveOpen(true)}>Архів гравців</button>} /><SeasonManagement client={client} groups={groups} onSaved={onRefresh} />{error && <StatusMessage kind="warning">{error}</StatusMessage>}{loading ? <LoadingState /> : metrics.length ? <div className="group-admin-grid">{metrics.map((group) => <article key={group.id} className="group-admin-card"><button type="button" className="group-card-main" onClick={() => setDetailsGroup(group)} aria-label={`Відкрити групу ${groupCode(group)}`}><header><div><span className="group-code">{groupLabel(group)}</span><h2>{group.competition_format || (group.group_kind === "goalkeeper" ? "Спеціалізована підготовка воротарів" : "Формат не вказано")}</h2></div><ChevronRight aria-hidden="true" /></header><p className="coach-line"><Users size={17} />{group.coachName}</p><div className="group-metrics"><div><Users /><span><b>{group.playerCount}</b><small>гравців</small></span></div><div><CalendarDays /><span><b>{group.trainingCount}</b><small>тренувань</small></span></div><div><ClipboardCheck /><span><b>{group.attendancePercent === null ? "—" : `${group.attendancePercent}%`}</b><small>відвідування</small></span></div></div><span className="group-open-label">Відкрити групу<ChevronRight size={17} aria-hidden="true" /></span></button><div className="group-card-actions"><button type="button" className="secondary-action" onClick={() => setFormatGroup(group)}><Pencil size={17} />Формат</button><button type="button" className="secondary-action" onClick={() => setInventoryGroup(group)}><Boxes size={17} />Інвентар</button></div></article>)}</div> : <EmptyState title="Групи не створено" />}{detailsGroup && !selectedPlayer && <GroupDetailsModal key={rosterVersion} client={client} group={detailsGroup} onClose={() => setDetailsGroup(null)} onPlayerOpen={(player, photoUrl) => setSelectedPlayer({ player, photoUrl })} />}{selectedPlayer && <PlayerDetails client={client} profile={profile} transferGroups={groups} onProfileSaved={() => { setSelectedPlayer(null); setRosterVersion(value => value + 1); void load(); }} player={selectedPlayer.player} photoUrl={selectedPlayer.photoUrl} onClose={() => setSelectedPlayer(null)} />}{archiveOpen && <ArchivedPlayers client={client} onClose={() => setArchiveOpen(false)} onPlayerOpen={(player, photoUrl) => { setArchiveOpen(false); setSelectedPlayer({player,photoUrl}); }} />}{formatGroup && <GroupFormatModal client={client} group={formatGroup} onClose={() => setFormatGroup(null)} onSaved={() => { setFormatGroup(null); onRefresh(); void load(); }} />}{inventoryGroup && <GroupInventoryModal client={client} group={inventoryGroup} onClose={() => setInventoryGroup(null)} />}</div>;
}

function ArchivedPlayers({client,onClose,onPlayerOpen}: {client:SupabaseClient;onClose:()=>void;onPlayerOpen:(player:AdminGroupPlayer, photoUrl?:string)=>void}) {
  const [rows,setRows]=useState<AdminGroupPlayer[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [search,setSearch]=useState("");
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try {
        const all:AdminGroupPlayer[]=[];
        for(let offset=0;;offset+=500){
          const result=await client.from("players").select("*, groups(code, display_code, cohort_birth_year, season), player_photos(is_current, file_assets(bucket, object_path))").eq("is_active",false).order("full_name").order("id").range(offset,offset+499);
          if(result.error)throw result.error;
          const page=(result.data??[]) as unknown as AdminGroupPlayer[];
          all.push(...page);
          if(page.length<500)break;
        }
        if(active)setRows(all);
      } catch {if(active)setError("Не вдалося завантажити архів гравців.");}
      finally {if(active)setLoading(false);}
    })();
    return ()=>{active=false;};
  },[client]);
  const filtered=rows.filter(row=>row.full_name.toLocaleLowerCase("uk-UA").includes(search.trim().toLocaleLowerCase("uk-UA")));
  async function open(player:AdminGroupPlayer){
    const asset=player.player_photos?.find(photo=>photo.is_current)?.file_assets;
    let photoUrl:string|undefined;
    if(asset){
      const result=await client.storage.from(asset.bucket).createSignedUrl(asset.object_path,600);
      photoUrl=result.data?.signedUrl;
    }
    onPlayerOpen(player,photoUrl);
  }
  return <Modal title="Архів гравців" onClose={onClose} wide><p>Профілі гравців, вилучених з активного складу. Історичні дані збережені.</p><SearchField value={search} onChange={setSearch} placeholder="Пошук гравця" />{error&&<StatusMessage kind="error">{error}</StatusMessage>}{loading?<LoadingState />:filtered.length?<div className="compact-list">{filtered.map(player=><article key={player.id}><div><b>{player.full_name}</b><small>{groupCode(player.groups)}</small></div><button className="secondary-action" type="button" onClick={()=>void open(player)}>Відкрити профіль</button></article>)}</div>:<EmptyState title="Архівних гравців не знайдено" />}</Modal>;
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
      const { data, error: loadError } = await client.from("players").select("id, group_id, full_name, first_name, last_name, middle_name, birth_date, birth_year, position, dominant_foot, coach_note, coach_note_author_id, coach_note_author_name, coach_note_updated_at, is_active, updated_at, groups(code, display_code, cohort_birth_year, season), uniform_requests(id, status), player_photos(is_current, file_assets(bucket, object_path))").eq("group_id", group.id).eq("is_active", true).order("full_name");
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
        const asset = player.player_photos?.find((photo) => photo.is_current)?.file_assets;
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

  return <Modal title={`Група · ${groupLabel(group)}`} onClose={onClose} wide footer={<button className="primary-action" type="button" onClick={onClose}>Закрити</button>}>
    <div className="group-detail-head"><div><Pill tone="plum">{group.group_kind === "goalkeeper" ? "Воротарська група" : "Вікова команда"}</Pill><h3>{group.competition_format || "Формат не вказано"}</h3><p className="coach-line"><Users size={17} />{group.coachName}</p></div><div className="group-metrics group-detail-metrics"><div><Users /><span><b>{group.playerCount}</b><small>гравців</small></span></div><div><CalendarDays /><span><b>{group.trainingCount}</b><small>тренувань цього місяця</small></span></div><div><ClipboardCheck /><span><b>{group.attendancePercent === null ? "—" : `${group.attendancePercent}%`}</b><small>відвідування</small></span></div></div></div>
    {(group.regulation_source || group.regulation_verified_on) && <section className="profile-section"><h3>Регламент і формат</h3><div className="detail-list">{group.regulation_source && <div><ClipboardCheck /><span><b>Джерело регламенту</b><small>{group.regulation_source}</small></span></div>}{group.regulation_verified_on && <div><CalendarDays /><span><b>Дата перевірки</b><small>{new Date(group.regulation_verified_on).toLocaleDateString("uk-UA")}</small></span></div>}</div></section>}
    <GroupMonthlyPlan client={client} group={group} />
    <section className="profile-section group-roster"><div className="section-title-row"><div><p className="eyebrow">Склад команди</p><h3>Гравці групи</h3></div><Pill tone="neutral">{players.length}</Pill></div>
      {error && <StatusMessage kind="error">{error}</StatusMessage>}
      {paymentWarning && <StatusMessage kind="warning">{paymentWarning}</StatusMessage>}
      {loading ? <LoadingState label="Завантажуємо гравців…" /> : players.length ? <><SearchField value={search} onChange={setSearch} placeholder="Пошук за прізвищем або амплуа" />{filteredPlayers.length ? <div className="player-grid group-player-grid">{filteredPlayers.map((player) => {
        const issued = relationOne(player.uniform_requests)?.status === "issued";
        const payment = paymentIndicators[player.id];
        return <button className="player-card" type="button" key={player.id} onClick={() => onPlayerOpen(player, photoUrls[player.id])}>{photoUrls[player.id] ? <Image unoptimized width={64} height={64} src={photoUrls[player.id]} alt="" /> : <span className="avatar-placeholder"><UserRound /></span>}<div><h2>{player.full_name}</h2><p>{player.birth_date ? new Date(player.birth_date).getFullYear() : player.birth_year ?? "Рік не вказано"} · {player.position || "Амплуа не вказано"}</p><div className="player-card-pills"><Pill tone={issued ? "success" : "warning"}>{issued ? "Формою забезпечено" : "Форма не видана"}</Pill>{payment && !payment.currentPaid && <Pill tone="danger">Не сплачено за {currentMonthName}</Pill>}{payment?.hasPastDebt && <Pill tone="danger">Є заборгованість</Pill>}</div></div><ChevronRight aria-hidden="true" /></button>;
      })}</div> : <EmptyState title="Гравців за цим запитом не знайдено" />}</> : <EmptyState title="У цій групі ще немає гравців">Група залишається активною і доступною для призначення тренера.</EmptyState>}
    </section>
  </Modal>;
}

function GroupMonthlyPlan({ client, group }: { client: SupabaseClient; group: GroupSummary }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [view, setView] = useState<"calendar" | "list">("list");
  const [events, setEvents] = useState<AdminGroupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const bounds = kyivMonthBounds(month);
    setLoading(true);
    setError(null);
    void client.from("events")
      .select("id, event_type, start_at, duration_minutes, venue_part, status, title, notes, organizational_need, coach:profiles!events_coach_id_fkey(full_name), venues(name, parent_venue_id), methodology_tasks(title)")
      .eq("group_id", group.id)
      .gte("start_at", bounds.start)
      .lt("start_at", bounds.end)
      .order("start_at")
      .then(({ data, error: loadError }) => {
        if (!active) return;
        setEvents(loadError ? [] : (data ?? []) as unknown as AdminGroupEvent[]);
        setError(loadError ? "Не вдалося завантажити план групи за цей місяць." : null);
        setLoading(false);
      });
    return () => { active = false; };
  }, [client, group.id, month]);

  const monthLabel = new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric" }).format(month);
  const cells = useMemo(() => monthCells(month), [month]);

  return <section className="profile-section group-month-plan">
    <div className="section-title-row group-plan-heading">
      <div><p className="eyebrow">Єдиний план подій</p><h3>План групи на місяць</h3></div>
      <div className="group-plan-view" role="group" aria-label="Вигляд плану">
        <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={17} />Список</button>
        <button type="button" className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}><CalendarDays size={17} />Календар</button>
      </div>
    </div>
    <div className="group-plan-month">
      <button type="button" aria-label="Попередній місяць" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft /></button>
      <strong>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</strong>
      <button type="button" aria-label="Наступний місяць" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight /></button>
    </div>
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
    {loading ? <LoadingState label="Завантажуємо план групи…" /> : !events.length ? <EmptyState title="Подій у цьому місяці немає">План залишається доступним навіть для групи без гравців або призначеного тренера.</EmptyState> : view === "list" ? <div className="group-plan-list">{events.map((event) => {
      const coach = relationOne(event.coach);
      const venue = relationOne(event.venues);
      const task = relationOne(event.methodology_tasks);
      return <article key={event.id} className={event.status === "cancelled" ? "cancelled" : ""}>
        <div className="group-plan-date"><b>{formatDate(event.start_at)}</b><span>{formatTime(event.start_at)} · {event.duration_minutes} хв</span></div>
        <div className="group-plan-copy"><div><Pill tone="plum">{EVENT_LABELS[event.event_type]}</Pill><Pill tone={event.status === "completed" ? "success" : event.status === "cancelled" ? "danger" : "neutral"}>{EVENT_STATUS_LABELS[event.status]}</Pill></div><h4>{task?.title ?? event.title ?? "Завдання або назву не вказано"}</h4><p><MapPin size={15} />{eventVenueLabel(venue?.name, event.venue_part, Boolean(venue?.parent_venue_id))}</p><p><Users size={15} />{coach?.full_name ?? "Видалений тренер"}</p>{event.organizational_need && <small><b>Організаційні потреби:</b> {event.organizational_need}</small>}{event.notes && <small><b>Уточнення:</b> {event.notes}</small>}</div>
      </article>;
    })}</div> : <div className="group-plan-calendar-wrap"><div className="group-plan-weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((day) => <span key={day}>{day}</span>)}</div><div className="group-plan-calendar">{cells.map((date, index) => {
      if (!date) return <div className="empty" key={`empty-${index}`} />;
      const dayEvents = events.filter((event) => sameCalendarDay(date, event.start_at));
      return <div key={date.toISOString()}><b>{date.getDate()}</b>{dayEvents.map((event) => <article key={event.id} className={event.status === "cancelled" ? "cancelled" : ""}><span>{formatTime(event.start_at)}</span><strong>{EVENT_LABELS[event.event_type]}</strong><small>{relationOne(event.coach)?.full_name ?? "Видалений тренер"}</small></article>)}</div>;
    })}</div></div>}
    <p className="muted group-plan-note">Перегляд без редагування. Дані беруться з того самого плану подій, який веде тренер.</p>
  </section>;
}

function GroupFormatModal({ client, group, onClose, onSaved }: { client: SupabaseClient; group: GroupSummary; onClose: () => void; onSaved: () => void }) {
  const [format, setFormat] = useState(group.competition_format ?? "");
  const [source, setSource] = useState(group.regulation_source ?? "");
  const [verified, setVerified] = useState(group.regulation_verified_on ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); const result = await client.from("groups").update({ competition_format: format || null, regulation_source: source || null, regulation_verified_on: verified || null }).eq("id", group.id); setBusy(false); if (result.error) { setError("Формат не збережено."); return; } onSaved(); }
  return <Modal title={`${group.group_kind === "goalkeeper" ? "Формат роботи" : "Формат змагань"} · ${groupCode(group)}`} onClose={onClose} footer={<><button type="button" className="secondary-action" onClick={onClose}>Скасувати</button><button form="group-format" className="primary-action" disabled={busy}>Зберегти</button></>}><form id="group-format" className="form-stack" onSubmit={save}><label><span>Робочий формат</span><input value={format} onChange={(e) => setFormat(e.target.value)} placeholder={group.group_kind === "goalkeeper" ? "Наприклад, техніка воротаря" : "Наприклад, 6+1"} /></label><label><span>Джерело регламенту</span><input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Назва або посилання на регламент" /></label><label><span>Дата перевірки</span><input type="date" value={verified} onChange={(e) => setVerified(e.target.value)} /></label><p className="muted">Призначення тренера змінюється лише у «Керування → Користувачі й паролі».</p>{error && <StatusMessage kind="error">{error}</StatusMessage>}</form></Modal>;
}

function GroupInventoryModal({ client, group, onClose }: { client: SupabaseClient; group: GroupSummary; onClose: () => void }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void client.from("inventory_items").select("id, group_id, name, quantity, damaged, lost, needed, is_active").eq("group_id", group.id).eq("is_active", true).order("name").then(({ data }) => { setItems((data ?? []) as InventoryItem[]); setLoading(false); }); }, [client, group.id]);
  return <Modal title={`Інвентар · ${groupCode(group)}`} onClose={onClose} footer={<button className="primary-action" type="button" onClick={onClose}>Закрити</button>}>{loading ? <LoadingState /> : items.length ? <div className="responsive-table"><table><thead><tr><th>Позиція</th><th>Кількість</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.quantity} шт.</td></tr>)}</tbody></table></div> : <EmptyState title="Інвентар не внесено" />}<p className="muted modal-note">Це лише перегляд. Редагування виконується у «Керування → Інвентар» або тренером за дозволом.</p></Modal>;
}
