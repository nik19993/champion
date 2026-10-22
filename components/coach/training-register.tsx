"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ClubCardAction } from "@/components/star/club-card";
import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, LoadingState, Modal, Pill, StatusMessage } from "@/components/common/workspace-ui";
import { BEHAVIOR_REASON_LABELS, BehaviorCardAction, VoidBehaviorCardAction } from "@/components/star/monthly-star";
import { formatDateTime, kyivDateKey, safeError } from "@/lib/domain/format";
import { groupCode } from "@/lib/domain/seasons";
import { completionResult, relationOne, type TrainingRegisterCompletion } from "@/lib/domain/training-register";
import type { EventItem, PlayerBehaviorCard, PlayerClubCard, Profile } from "@/lib/domain/types";
import { ATTENDANCE_QUEUE_CHANGED_EVENT, enqueueAttendance, flushAttendanceQueue, persistAttendance, queuedAttendance, type AttendanceQueueItem } from "@/lib/offline/attendance-queue";

type Status = "present" | "absent";
type RegisterPlayer = { id: string; full_name: string; historical?: boolean };
type RecordRow = { player_id: string; status: Status; note?: string | null; players?: RegisterPlayer | RegisterPlayer[] | null };
type Session = { id: string; completed_at: string | null; server_version: number; attendance_records?: RecordRow[] | null };
interface Props {
  client: SupabaseClient;
  profile: Profile;
  event: EventItem;
  onClose: () => void;
  onChanged: () => void;
  onCompleted: (completion: TrainingRegisterCompletion) => void;
}

export function TrainingRegisterModal({ client, profile, event, onClose, onChanged, onCompleted }: Props) {
  const [players, setPlayers] = useState<RegisterPlayer[]>([]);
  const [records, setRecords] = useState<Record<string, Status>>({});
  const [savedRecords, setSavedRecords] = useState<RecordRow[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [clubCards, setClubCards] = useState<PlayerClubCard[]>([]);
  const [cards, setCards] = useState<PlayerBehaviorCard[]>([]);
  const [completion, setCompletion] = useState<TrainingRegisterCompletion | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "warning" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cardInteraction, setCardInteraction] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const mounted = useRef(true);
  const revision = useRef(0);
  const pendingRef = useRef(false);
  const activePlayers = useMemo(() => players.filter((player) => !player.historical), [players]);
  const savedById = useMemo(() => Object.fromEntries(savedRecords.map((row) => [row.player_id, row.status])), [savedRecords]);
  const dirty = !session?.completed_at || activePlayers.some((player) => records[player.id] !== savedById[player.id]);
  const completed = Boolean(!pending && !dirty && completion?.completed_at && completion.attendance_version === session?.server_version);
  const presentCount = Object.values(records).filter((status) => status === "present").length;
  const disabled = busy || loading || Boolean(loadError) || cardInteraction;
  const cardsEnabled = !busy && !loading && !loadError && !dirty && !pending && online && Boolean(session?.completed_at);

  const load = useCallback(async () => {
    const request = ++revision.current;
    try {
      const [playerResult, sessionResult, cardResult, clubCardResult, completionQuery, queue] = await Promise.all([
        client.from("players").select("id, full_name").eq("group_id", event.group_id).eq("is_active", true).order("full_name"),
        client.from("attendance_sessions").select("id, completed_at, server_version, attendance_records(player_id, status, note, players(id, full_name))").eq("event_id", event.id).maybeSingle(),
        client.from("player_behavior_cards").select("id, player_id, group_id, event_id, reason, comment, occurred_on, coach_name_snapshot, is_voided").eq("event_id", event.id).eq("is_voided", false),
        client.from("player_club_cards").select("id, player_id, group_id, event_id, is_voided").eq("event_id", event.id).eq("is_voided", false),
        client.from("training_register_completions").select("*").eq("event_id", event.id).maybeSingle(),
        queuedAttendance(profile.id),
      ]);
      if (!mounted.current || request !== revision.current) return false;
      if (playerResult.error || sessionResult.error || cardResult.error || clubCardResult.error || completionQuery.error) throw new Error("LOAD_FAILED");
      const currentPlayers = (playerResult.data ?? []) as RegisterPlayer[];
      const currentSession = relationOne(sessionResult.data as Session | Session[] | null);
      const stored = currentSession?.attendance_records ?? [];
      const knownIds = new Set(currentPlayers.map((player) => player.id));
      const historical = stored.filter((row) => !knownIds.has(row.player_id)).map((row) => ({ id: row.player_id, full_name: relationOne(row.players)?.full_name ?? "Історичний учасник", historical: true }));
      const pendingItem = queue.filter((item) => item.eventId === event.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const source = pendingItem?.records ?? stored;
      const byId = Object.fromEntries(source.map((row) => [row.player_id, row.status]));
      for (const row of stored) if (!(row.player_id in byId)) byId[row.player_id] = row.status;
      for (const player of currentPlayers) if (!(player.id in byId)) byId[player.id] = "present";
      setPlayers([...currentPlayers, ...historical]);
      setRecords(byId);
      setSavedRecords(stored);
      setSession(currentSession);
      setCards((cardResult.data ?? []) as PlayerBehaviorCard[]);
      setClubCards((clubCardResult.data ?? []) as PlayerClubCard[]);
      setCompletion((completionQuery.data as TrainingRegisterCompletion | null) ?? null);
      const wasPending = pendingRef.current;
      pendingRef.current = Boolean(pendingItem);
      setPending(Boolean(pendingItem));
      if (wasPending && !pendingItem) setMessage({ kind: "success", text: "Присутність синхронізовано. Перевірте картки та завершіть облік тренування." });
      setLoadError(null);
      setLoading(false);
      return { stored, session: currentSession };
    } catch {
      if (mounted.current && request === revision.current) {
        setLoadError("Не вдалося повністю завантажити відмітки. Повторіть завантаження перед збереженням або завершенням.");
        setCompletion(null);
        setLoading(false);
      }
      return false;
    }
  }, [client, event.group_id, event.id, profile.id]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
  }, [load]);

  useEffect(() => {
    const onlineChanged = () => setOnline(navigator.onLine);
    const synchronized = () => { if (pending && !busy) void load(); };
    window.addEventListener("online", onlineChanged);
    window.addEventListener("offline", onlineChanged);
    window.addEventListener(ATTENDANCE_QUEUE_CHANGED_EVENT, synchronized);
    return () => {
      window.removeEventListener("online", onlineChanged);
      window.removeEventListener("offline", onlineChanged);
      window.removeEventListener(ATTENDANCE_QUEUE_CHANGED_EVENT, synchronized);
    };
  }, [busy, load, pending]);

  function close() {
    if (busy || cardInteraction) return;
    if (!loading && !loadError && dirty && !pending && !window.confirm("Вийти без збереження змін присутності?")) return;
    onClose();
  }

  async function saveAttendance() {
    if (disabled || (!dirty && !pending)) return;
    setBusy(true);
    setMessage(null);
    if (pending) {
      try {
        const result = await flushAttendanceQueue(client, profile.id);
        await load();
        if (result.remaining) setMessage({ kind: "warning", text: "Очікує синхронізації. Сервер ще недоступний; відмітки залишилися на пристрої." });
        onChanged();
      } catch { setMessage({ kind: "warning", text: "Не вдалося синхронізувати. Відмітки залишилися на пристрої; повторіть пізніше." }); }
      finally { if (mounted.current) setBusy(false); }
      return;
    }
    const item: AttendanceQueueItem = {
      idempotencyKey: crypto.randomUUID(), eventId: event.id, completedBy: profile.id, createdAt: new Date().toISOString(),
      records: activePlayers.map((player) => ({ player_id: player.id, status: records[player.id] ?? "present", note: savedRecords.find((row) => row.player_id === player.id)?.note ?? "" })),
    };
    async function queue() {
      await enqueueAttendance(item);
      pendingRef.current = true;
      setPending(true);
      setCompletion(null);
      setMessage({ kind: "warning", text: "Очікує синхронізації. Присутність збережена на цьому пристрої; облік ще не завершено." });
    }
    try {
      if (!navigator.onLine) await queue();
      else {
        try { await persistAttendance(client, item); }
        catch (error) {
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
          if (["42501", "22023", "P0002", "23514"].includes(code)) throw error;
          await queue();
          return;
        }
        // A failed refresh is never mistaken for an unsuccessful write/requeued.
        const refreshed = await load();
        if (refreshed) {
          const savedPresent = refreshed.stored.filter((row) => row.status === "present").length;
          setMessage({ kind: "success", text: `Присутність збережено: ${savedPresent} присутніх, ${refreshed.stored.length - savedPresent} відсутніх. За потреби внесіть жовті картки або картки клубу та завершіть облік.` });
        }
        onChanged();
      }
    } catch (error) {
      setMessage({ kind: "error", text: safeError(error, "Присутність не збережено. Відмітки залишилися на екрані — повторіть дію.") });
    } finally { if (mounted.current) setBusy(false); }
  }

  async function finish() {
    if (disabled || dirty || pending || !online || completed || !session?.completed_at) return;
    setBusy(true);
    setMessage(null);
    try {
      if ((await queuedAttendance(profile.id)).some((item) => item.eventId === event.id)) {
        setPending(true);
        setMessage({ kind: "warning", text: "Очікує синхронізації. Спочатку дочекайтеся збереження присутності на сервері." });
        return;
      }
      const result = await client.rpc("complete_training_register_with_club_cards", { p_expected_club_card_ids: clubCards.map(card => card.id), p_event_id: event.id, p_expected_attendance_version: session.server_version, p_expected_card_ids: cards.map((card) => card.id), p_expected_records: savedRecords.map((row) => ({ player_id: row.player_id, status: row.status, note: row.note ?? null })) });
      if (result.error) throw result.error;
      const confirmed = completionResult(result.data);
      if (!confirmed || confirmed.attendance_version !== session.server_version || confirmed.club_card_count !== clubCards.length) throw new Error("INVALID_COMPLETION_RESPONSE");
      setCompletion(confirmed);
      onCompleted(confirmed);
    } catch (error) {
      const detail = error && typeof error === "object" && "message" in error ? String(error.message) : "";
      const text = detail.includes("REGISTER_CHANGED") ? "Відмітки змінилися в іншому вікні. Оновіть їх, перевірте та повторно завершіть облік."
        : detail.includes("CARD_ATTENDANCE_MISMATCH") ? "Є картка для відсутнього гравця. Перевірте присутність або анулюйте помилкову картку."
          : detail.includes("ATTENDANCE_INCOMPLETE") ? "Склад групи змінився. Оновіть список і збережіть присутність усіх учасників."
            : "Облік не завершено. Перевірте підключення та повторіть дію; збережені відмітки залишилися.";
      setMessage({ kind: "error", text });
    } finally { if (mounted.current) setBusy(false); }
  }

  async function cardSaved(text: string) {
    setCardInteraction(false);
    setBusy(true);
    try {
      await load();
      setMessage({ kind: "success", text });
      onChanged();
    } finally { if (mounted.current) setBusy(false); }
  }

  return <Modal title={`Облік тренування · ${groupCode(event.groups)}`} onClose={close} wide footer={<div className="training-register-actions">
    <button type="button" className="secondary-action" onClick={close} disabled={busy || cardInteraction}>Закрити</button>
    <button type="button" className="secondary-action" onClick={() => void saveAttendance()} disabled={disabled || (pending && !online) || (!dirty && !pending)}>{busy ? "Збереження…" : pending ? "Синхронізувати присутність" : "Зберегти присутність"}</button>
    <button type="button" className="primary-action" onClick={() => void finish()} disabled={disabled || dirty || pending || !online || completed || !session?.completed_at}>{busy ? "Збереження…" : completed ? "Облік завершено" : cards.length || clubCards.length ? "Завершити облік тренування" : "Карток немає — завершити облік"}</button>
  </div>}>
    <div className="training-register-context"><b>{formatDateTime(event.start_at)}</b><p>Присутність, жовті картки та картки клубу можна вносити на початку, наприкінці або після тренування, зокрема пізніше іншого дня.</p></div>
    {loading ? <LoadingState /> : <>
      {loadError && <><StatusMessage kind="error">{loadError}</StatusMessage><button className="secondary-action" type="button" onClick={() => void load()}>Повторити завантаження</button></>}
      {!loadError && <>
        <div className="training-register-summary" role="status">
          <Pill tone={completed ? "success" : pending ? "warning" : "neutral"}>{pending ? "Очікує синхронізації" : completed ? "✓ Облік завершено" : dirty ? "Присутність не збережена" : "Присутність збережена · облік не завершено"}</Pill>
          <span>Присутні {presentCount} із {players.length} · жовтих карток {cards.length} · карток клубу {clubCards.length}</span>
          {completed && completion?.completed_at && <small>Підтверджено {formatDateTime(completion.completed_at)}</small>}
        </div>
        {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
        {!online && <StatusMessage kind="warning">Немає інтернету. Присутність можна зберегти на пристрої; картки та завершення обліку потребують з’єднання.</StatusMessage>}
        <div className="training-register-toolbar"><h3>Присутність і картки</h3><button type="button" className="secondary-action small" disabled={disabled || pending} onClick={() => setRecords((current) => ({ ...current, ...Object.fromEntries(activePlayers.map((player) => [player.id, "present"])) }))}>Усі присутні</button></div>
        {players.length ? <div className="attendance-list">{players.map((player) => {
          const status = records[player.id] ?? "present";
          const card = cards.find((item) => item.player_id === player.id);
          return <article className={`attendance-row training-register-row ${status}`} key={player.id}>
            <div className="attendance-player-name"><b>{player.full_name}</b>{player.historical && <small>Історичний учасник · відмітку збережено</small>}</div>
            <div className="attendance-status-choice" role="group" aria-label={`Присутність · ${player.full_name}`}>
              <button type="button" disabled={disabled || pending || player.historical} className={status === "present" ? "selected present" : ""} aria-pressed={status === "present"} onClick={() => setRecords((current) => ({ ...current, [player.id]: "present" }))}><Check size={16} />Присутній</button>
              <button type="button" disabled={disabled || pending || player.historical} className={status === "absent" ? "selected absent" : ""} aria-pressed={status === "absent"} onClick={() => setRecords((current) => ({ ...current, [player.id]: "absent" }))}>Відсутній</button>
            </div>
            <div className="training-register-card">
              {card ? <><span className="attendance-card-recorded"><Check size={16} />Картку збережено</span><small>{BEHAVIOR_REASON_LABELS[card.reason]}{card.comment ? ` · ${card.comment}` : ""}</small>{cardsEnabled && <VoidBehaviorCardAction client={client} card={card} playerName={player.full_name} onInteractionChange={setCardInteraction} onSaved={() => cardSaved("Помилкову картку анульовано. Історію збережено; підтвердіть завершення обліку повторно.")} />}</>
                : !cardsEnabled ? <small>{pending ? "Очікує синхронізації" : dirty ? "Спочатку збережіть присутність" : !online ? "Потрібен інтернет" : ""}</small>
                  : status === "present" && !player.historical ? <BehaviorCardAction client={client} profile={profile} player={player} groupId={event.group_id} eventId={event.id} occurredOn={kyivDateKey(event.start_at)} className="yellow-card-action small" onInteractionChange={setCardInteraction} onSaved={() => void cardSaved("Картку збережено. Після внесення всіх карток завершіть облік тренування.")} />
                    : <small>{status === "absent" ? "Картка недоступна для відсутнього" : "Історичний учасник"}</small>}
            </div>
            <ClubCardAction client={client} eventId={event.id} player={player} card={clubCards.find(card => card.player_id === player.id)} disabled={!cardsEnabled || (!clubCards.some(card => card.player_id === player.id) && (status !== "present" || Boolean(player.historical)))} onInteractionChange={setCardInteraction} onChanged={() => cardSaved("Картку клубу оновлено. Підтвердіть завершення обліку.")} />
          </article>;
        })}</div> : <EmptyState title="У групі немає гравців" />}
        {dirty && <p className="field-hint">Збережіть присутність перед внесенням карток і завершенням обліку.</p>}
        <p className="field-hint">Завершення обліку підтверджує відмітки та не змінює час події чи бронювання поля.</p>
        <button type="button" className="text-action" disabled={disabled || (dirty && Boolean(session))} onClick={() => void load()}>Оновити відмітки</button>
      </>}
    </>}
  </Modal>;
}
