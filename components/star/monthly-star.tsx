"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, MessageCircle, ShieldAlert, Star, Trophy, Undo2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState, Modal, Pill, StatusMessage } from "@/components/common/workspace-ui";
import { formatDate, formatMonth, kyivDateKey } from "@/lib/domain/format";
import type { BehaviorCardReason, GroupSummary, MonthlyStarAward, MonthlyStarTheme, ParentContactAction, Player, PlayerBehaviorCard, Profile } from "@/lib/domain/types";

export const BEHAVIOR_REASON_LABELS: Record<BehaviorCardReason, string> = {
  late: "Запізнення",
  discipline_violation: "Порушення дисципліни",
  coach_noncompliance: "Невиконання вимог тренера",
  safety: "Порушення правил безпеки",
  unsporting_behavior: "Неспортивна поведінка",
  disrespect: "Неповага",
  other: "Інше",
};

const AWARD_LABELS = {
  coach_choice: "Зірка місяця",
  team_choice: "Зірка місяця",
} as const;

function currentMonth() {
  return `${kyivDateKey(new Date()).slice(0, 7)}-01`;
}

function relationOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function MonthlyStarThemeBanner({ client }: { client: SupabaseClient }) {
  const [theme, setTheme] = useState<MonthlyStarTheme | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void client.from("monthly_star_themes").select("id, month, title, description, criteria").eq("month", currentMonth()).maybeSingle().then(({ data }) => {
      if (!active) return;
      setTheme((data as MonthlyStarTheme | null) ?? null);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [client]);
  if (!loaded) return null;
  return <section className="monthly-star-banner"><span className="monthly-star-icon" aria-hidden="true">★</span><div><p>ЗІРКА МІСЯЦЯ</p>{theme ? <><h2>{formatMonth(theme.month).split(" ")[0]} — {theme.title}</h2><span>{theme.description}</span>{theme.criteria && <small>Критерії: {theme.criteria}</small>}</> : <><h2>Тему місяця ще не визначено</h2><span>Адміністратор додасть тему та критерії для всіх груп.</span></>}</div></section>;
}

export function BehaviorCardAction({ client, profile, player, groupId, eventId, occurredOn, label = "Жовта картка", className = "yellow-card-action", onSaved }: { client: SupabaseClient; profile: Profile; player: Pick<Player, "id" | "full_name">; groupId: string; eventId: string; occurredOn: string; label?: string; className?: string; onSaved?: () => void }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={className} onClick={() => setOpen(true)}><ShieldAlert size={16} />{label}</button>{open && <BehaviorCardModal client={client} profile={profile} player={player} groupId={groupId} eventId={eventId} occurredOn={occurredOn} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved?.(); }} />}</>;
}

function BehaviorCardModal({ client, profile, player, groupId, eventId, occurredOn, onClose, onSaved }: { client: SupabaseClient; profile: Profile; player: Pick<Player, "id" | "full_name">; groupId: string; eventId: string; occurredOn: string; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState<BehaviorCardReason>("late");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (reason === "other" && comment.trim().length < 2) { setError("Для причини «Інше» додайте коротке пояснення."); return; }
    setBusy(true); setError(null);
    const result = await client.from("player_behavior_cards").insert({
      player_id: player.id,
      group_id: groupId,
      coach_id: profile.id,
      coach_name_snapshot: profile.full_name,
      event_id: eventId,
      occurred_on: occurredOn,
      reason,
      comment: comment.trim() || null,
    });
    setBusy(false);
    if (result.error) { setError(result.error.code === "23505" ? "Для цього гравця картку в цій події вже зафіксовано." : "Картку не збережено. Перевірте доступ до групи й повторіть дію."); return; }
    onSaved();
  }
  return <Modal title={`Жовта картка · ${player.full_name}`} onClose={onClose} footer={<><button type="button" className="secondary-action" onClick={onClose}>Скасувати</button><button form="behavior-card-form" className="warning-action" disabled={busy}>{busy ? "Збереження…" : "Зафіксувати картку"}</button></>}><form id="behavior-card-form" className="form-stack" onSubmit={save}><label><span>Причина</span><select value={reason} onChange={(event) => setReason(event.target.value as BehaviorCardReason)}>{Object.entries(BEHAVIOR_REASON_LABELS).map(([value, text]) => <option value={value} key={value}>{text}</option>)}</select></label><label><span>{reason === "other" ? "Коротке пояснення" : "Коментар — необов’язково"}</span><textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} required={reason === "other"} maxLength={500} /></label><p className="muted">Картка належить цьому гравцеві, групі та даті цієї події. Для одного гравця в одній події можна зафіксувати лише одну активну картку; помилковий запис анулюється із зазначенням причини.</p>{error && <StatusMessage kind="error">{error}</StatusMessage>}</form></Modal>;
}

function ParentContactAction({ client, profile, player, groupId, month, onSaved }: { client: SupabaseClient; profile: Profile; player: Pick<Player, "id" | "full_name">; groupId: string; month: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(kyivDateKey(new Date()));
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    const result = await client.from("parent_contact_actions").insert({
      player_id: player.id,
      group_id: groupId,
      month,
      coach_id: profile.id,
      coach_name_snapshot: profile.full_name,
      contacted_at: new Date(`${date}T12:00:00`).toISOString(),
      comment: comment.trim() || null,
      created_by: profile.id,
    });
    setBusy(false);
    if (result.error) { setError("Контакт не зафіксовано. Повторіть дію."); return; }
    setOpen(false); setComment(""); onSaved();
  }
  return <><button type="button" className="primary-action small" onClick={() => setOpen(true)}><MessageCircle size={16} />Контакт із батьками здійснено</button>{open && <Modal title={`Контакт із батьками · ${player.full_name}`} onClose={() => setOpen(false)} footer={<><button type="button" className="secondary-action" onClick={() => setOpen(false)}>Скасувати</button><button form="parent-contact-form" className="primary-action" disabled={busy}>{busy ? "Збереження…" : "Зберегти"}</button></>}><form id="parent-contact-form" className="form-stack" onSubmit={save}><label><span>Дата контакту</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label><span>Короткий коментар</span><textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} placeholder="Наприклад, обговорено правила дисципліни" /></label>{error && <StatusMessage kind="error">{error}</StatusMessage>}</form></Modal>}</>;
}

export function PlayerAchievementBehavior({ client, profile, player }: { client: SupabaseClient; profile?: Profile; player: Player }) {
  const [cards, setCards] = useState<PlayerBehaviorCard[]>([]);
  const [contacts, setContacts] = useState<ParentContactAction[]>([]);
  const [awards, setAwards] = useState<MonthlyStarAward[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const month = currentMonth();
  const load = useCallback(async () => {
    setLoading(true);
    const [cardResult, contactResult, awardResult] = await Promise.all([
      client.from("player_behavior_cards").select("id, player_id, group_id, coach_id, coach_name_snapshot, event_id, occurred_on, month, reason, comment, is_voided, voided_at, void_reason").eq("player_id", player.id).order("occurred_on", { ascending: false }),
      client.from("parent_contact_actions").select("id, player_id, group_id, month, coach_id, coach_name_snapshot, contacted_at, comment").eq("player_id", player.id).order("contacted_at", { ascending: false }),
      client.from("monthly_star_awards").select("id, month, group_id, theme_id, award_type, player_id, correction_note, revoked_at, monthly_star_themes(id, month, title, description, criteria)").eq("player_id", player.id).order("month", { ascending: false }),
    ]);
    setCards((cardResult.data ?? []) as PlayerBehaviorCard[]);
    setContacts((contactResult.data ?? []) as ParentContactAction[]);
    setAwards((awardResult.data ?? []) as unknown as MonthlyStarAward[]);
    setLoading(false);
  }, [client, player.id]);
  useEffect(() => { void load(); }, [load]);
  const currentCards = cards.filter((card) => card.month === month && !card.is_voided);
  const contacted = contacts.some((contact) => contact.month === month);
  async function voidCard(card: PlayerBehaviorCard) {
    const reason = window.prompt("Вкажіть причину анулювання помилкової картки:");
    if (!reason?.trim()) return;
    const result = await client.rpc("void_behavior_card", { p_card_id: card.id, p_reason: reason.trim() });
    if (result.error) { setMessage("Картку не анульовано."); return; }
    setMessage("Помилкову картку анульовано; місячний підрахунок оновлено.");
    await load();
  }
  return <section className="profile-section achievement-behavior"><div className="section-title-row"><div><p className="eyebrow">Особиста історія</p><h3>Досягнення та поведінка</h3></div></div>{message && <StatusMessage kind="success">{message}</StatusMessage>}{loading ? <LoadingState /> : <><div className="behavior-summary"><div><span>Жовті картки цього місяця</span><b>{currentCards.length}</b></div><div><span>Статус «Зірки місяця»</span><b>{currentCards.length >= 4 ? "Не допускається" : "Може брати участь"}</b></div></div>{currentCards.length >= 3 && !contacted && profile && <div className="parent-contact-alert"><AlertTriangle /><div><b>Необхідний контакт із батьками</b><span>Зафіксовано {currentCards.length} активні картки цього місяця.</span></div><ParentContactAction client={client} profile={profile} player={player} groupId={player.group_id} month={month} onSaved={() => void load()} /></div>}{contacted && <StatusMessage kind="success">Контакт із батьками за цей місяць зафіксовано.</StatusMessage>}<div className="achievement-grid"><div><h4><Trophy size={17} />Відзнаки</h4>{awards.filter((award) => !award.revoked_at).length ? <div className="history-list">{awards.filter((award) => !award.revoked_at).map((award) => { const theme = relationOne(award.monthly_star_themes); return <article key={award.id}><b>{AWARD_LABELS[award.award_type]}</b><span>{formatMonth(award.month)} · {theme?.title ?? "Тема не вказана"}</span></article>; })}</div> : <p className="muted">Відзнак ще немає.</p>}</div><div><h4><ShieldAlert size={17} />Картки</h4>{cards.length ? <div className="history-list">{cards.map((card) => <article key={card.id} className={card.is_voided ? "voided" : ""}><b>{BEHAVIOR_REASON_LABELS[card.reason]}</b><span>{formatDate(card.occurred_on)} · {card.coach_name_snapshot}</span>{card.comment && <small>{card.comment}</small>}{card.is_voided ? <small>Анульовано: {card.void_reason}</small> : profile && <button type="button" className="text-action" onClick={() => void voidCard(card)}><Undo2 size={14} />Анулювати помилкову</button>}</article>)}</div> : <p className="muted">Карток немає.</p>}</div></div>{contacts.length > 0 && <div><h4>Історія контактів із батьками</h4><div className="history-list">{contacts.map((contact) => <article key={contact.id}><b>{formatDate(contact.contacted_at)}</b><span>{contact.coach_name_snapshot}</span>{contact.comment && <small>{contact.comment}</small>}</article>)}</div></div>}</>}</section>;
}

export function MonthlyStarGroupPanel({ client, profile, group }: { client: SupabaseClient; profile: Profile; group: GroupSummary }) {
  const month = currentMonth();
  const [theme, setTheme] = useState<MonthlyStarTheme | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [cards, setCards] = useState<PlayerBehaviorCard[]>([]);
  const [contacts, setContacts] = useState<ParentContactAction[]>([]);
  const [awards, setAwards] = useState<MonthlyStarAward[]>([]);
  const [coachChoice, setCoachChoice] = useState("");
  const [teamChoice, setTeamChoice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    const [themeResult, playerResult, cardResult, contactResult, awardResult] = await Promise.all([
      client.from("monthly_star_themes").select("id, month, title, description, criteria").eq("month", month).maybeSingle(),
      client.from("players").select("id, group_id, full_name, first_name, last_name, middle_name, birth_date, birth_year, position, dominant_foot, coach_note, is_active, groups(code)").eq("group_id", group.id).eq("is_active", true).order("full_name"),
      client.from("player_behavior_cards").select("id, player_id, group_id, coach_id, coach_name_snapshot, event_id, occurred_on, month, reason, comment, is_voided, voided_at, void_reason").eq("group_id", group.id).eq("month", month).order("occurred_on", { ascending: false }),
      client.from("parent_contact_actions").select("id, player_id, group_id, month, coach_id, coach_name_snapshot, contacted_at, comment").eq("group_id", group.id).eq("month", month),
      client.from("monthly_star_awards").select("id, month, group_id, theme_id, award_type, player_id, correction_note, revoked_at").eq("group_id", group.id).eq("month", month).is("revoked_at", null),
    ]);
    setTheme((themeResult.data as MonthlyStarTheme | null) ?? null);
    setPlayers((playerResult.data ?? []) as unknown as Player[]);
    setCards((cardResult.data ?? []) as PlayerBehaviorCard[]);
    setContacts((contactResult.data ?? []) as ParentContactAction[]);
    const nextAwards = (awardResult.data ?? []) as MonthlyStarAward[];
    setAwards(nextAwards);
    setCoachChoice(nextAwards.find((award) => award.award_type === "coach_choice")?.player_id ?? "");
    setTeamChoice(nextAwards.find((award) => award.award_type === "team_choice")?.player_id ?? "");
    setLoading(false);
  }, [client, group.id, month]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setMessage(null); }, [group.id]);
  const cardCounts = useMemo(() => Object.fromEntries(players.map((player) => [player.id, cards.filter((card) => card.player_id === player.id && !card.is_voided).length])) as Record<string, number>, [cards, players]);
  const contacted = useMemo(() => new Set(contacts.map((item) => item.player_id)), [contacts]);
  const actionable = players.filter((player) => (cardCounts[player.id] ?? 0) >= 3 && !contacted.has(player.id));
  const eligible = players.filter((player) => (cardCounts[player.id] ?? 0) < 4);
  async function saveAwards() {
    if (!theme || !coachChoice || !teamChoice || coachChoice === teamChoice) { setMessage({ kind: "error", text: "Оберіть двох різних гравців, які мають право на відзнаку." }); return; }
    setBusy(true); setMessage(null);
    const result = await client.rpc("save_monthly_star_awards", { p_group_id: group.id, p_month: month, p_theme_id: theme.id, p_coach_choice: coachChoice, p_team_choice: teamChoice, p_correction_note: null });
    setBusy(false);
    if (result.error) { setMessage({ kind: "error", text: result.error.message.includes("INELIGIBLE") ? "Обраний гравець має 4 або більше активних карток і не може отримати відзнаку." : "Результати не збережено. Перевірте вибір і повторіть дію." }); return; }
    setMessage({ kind: "success", text: "Двох переможців місяця підтверджено." });
    await load();
  }
  async function voidCard(card: PlayerBehaviorCard) {
    const reason = window.prompt("Вкажіть причину анулювання помилкової картки:");
    if (!reason?.trim()) return;
    const result = await client.rpc("void_behavior_card", { p_card_id: card.id, p_reason: reason.trim() });
    if (result.error) { setMessage({ kind: "error", text: "Картку не анульовано." }); return; }
    await load();
  }
  if (loading) return <LoadingState label="Завантажуємо «Зірку місяця»…" />;
  return <div className="monthly-star-group">
    <div className="monthly-star-group-theme"><Star /><div><p>Зірка місяця · {group.code}</p><h3>{theme ? `${formatMonth(theme.month).split(" ")[0]} — ${theme.title}` : "Тему місяця не визначено"}</h3>{theme && <span>{theme.description}</span>}</div></div>
    {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
    {actionable.length > 0 && <section className="star-action-list">
      <div className="section-title-row"><div><p className="eyebrow">Потребує дії</p><h3>Необхідний контакт із батьками</h3></div><Pill tone="danger">{actionable.length}</Pill></div>
      {actionable.map((player) => <article key={player.id}><div><b>{player.full_name}</b><span>{cardCounts[player.id]} активні картки цього місяця</span></div><ParentContactAction client={client} profile={profile} player={player} groupId={group.id} month={month} onSaved={() => void load()} /></article>)}
    </section>}
    <section>
      <div className="section-title-row"><div><p className="eyebrow">Без рейтингу</p><h3>Стан гравців групи</h3></div><Pill tone="neutral">{players.length}</Pill></div>
      {players.length ? <div className="star-player-overview">{players.map((player) => {
        const count = cardCounts[player.id] ?? 0;
        return <article key={player.id}><div><b>{player.full_name}</b><span>{count} {count === 1 ? "картка" : count >= 2 && count <= 4 ? "картки" : "карток"}</span></div><Pill tone={count >= 4 ? "danger" : count >= 3 ? "warning" : "success"}>{count >= 4 ? "Не допускається цього місяця" : count >= 3 ? contacted.has(player.id) ? "Контакт зафіксовано" : "Потрібен контакт" : "Може брати участь"}</Pill></article>;
      })}</div> : <EmptyState title="У групі немає активних гравців" />}
    </section>
    <section className="star-award-selection">
      <div className="section-title-row"><div><p className="eyebrow">Підсумок місяця</p><h3>Два різні переможці</h3></div>{awards.length === 2 && <Pill tone="success">Підтверджено</Pill>}</div>
      {theme ? <div className="form-grid">
        <label><span>Вибір тренера</span><select value={coachChoice} onChange={(event) => setCoachChoice(event.target.value)}><option value="">Оберіть гравця</option>{eligible.map((player) => <option key={player.id} value={player.id} disabled={player.id === teamChoice}>{player.full_name}</option>)}</select></label>
        <label><span>Вибір команди</span><select value={teamChoice} onChange={(event) => setTeamChoice(event.target.value)}><option value="">Оберіть гравця</option>{eligible.map((player) => <option key={player.id} value={player.id} disabled={player.id === coachChoice}>{player.full_name}</option>)}</select></label>
        <div className="span-2"><button type="button" className="primary-action" disabled={busy || !coachChoice || !teamChoice || coachChoice === teamChoice} onClick={() => void saveAwards()}><Trophy size={17} />{busy ? "Збереження…" : awards.length ? "Оновити вибір" : "Підтвердити двох переможців"}</button></div>
      </div> : <StatusMessage kind="warning">Спочатку адміністратор має визначити тему цього місяця.</StatusMessage>}
    </section>
    <section>
      <div className="section-title-row"><div><p className="eyebrow">Приватна історія групи</p><h3>Картки цього місяця</h3></div><Pill tone="warning">{cards.filter((card) => !card.is_voided).length}</Pill></div>
      {cards.length ? <div className="behavior-card-log">{cards.map((card) => {
        const player = players.find((item) => item.id === card.player_id);
        return <article key={card.id} className={card.is_voided ? "voided" : ""}><div><b>{player?.full_name ?? "Гравець"}</b><span>{BEHAVIOR_REASON_LABELS[card.reason]} · {formatDate(card.occurred_on)}</span>{card.comment && <small>{card.comment}</small>}{card.is_voided && <small>Анульовано: {card.void_reason}</small>}</div>{!card.is_voided && <button type="button" className="text-action" onClick={() => void voidCard(card)}><Undo2 size={14} />Анулювати</button>}</article>;
      })}</div> : <p className="muted">Карток цього місяця немає.</p>}
    </section>
  </div>;
}
