"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import Image from "next/image";
import { Camera, Check, ChevronRight, ImagePlus, Mail, Phone, Shirt, UserRound } from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, GroupSelect, LoadingState, Modal, Pill, SearchField, StatusMessage, Tabs, WorkspaceHeader } from "@/components/common/workspace-ui";
import { DraftStatus, SaveStateLabel, UndoLastChange, type DraftState, type SaveState } from "@/components/common/save-feedback";
import { MonthlyStarGroupPanel, PlayerAchievementBehavior } from "@/components/star/monthly-star";
import { formatDate, formatMonth, safeError, toMonthInput } from "@/lib/domain/format";
import type { FileAsset, GroupSummary, Guardian, Player, Profile, UniformCatalogItem, UniformRequest, UniformStatus } from "@/lib/domain/types";
import { UNIFORM_STATUS_LABELS } from "@/lib/domain/format";
import { clearDraft, draftKey, readDraft, writeDraft } from "@/lib/offline/drafts";
import { deletePrivateFile, uploadPrivateFile } from "@/lib/supabase/files";

interface Props { client: SupabaseClient; profile: Profile; groups: GroupSummary[]; }
type PlayerTab = "list" | "payments" | "uniform" | "monthly-star";
type Relation<T> = T | T[] | null;

interface PlayerWithUniform extends Player {
  uniform_requests?: Relation<{ id: string; status: UniformStatus }>;
  player_photos?: Array<{ is_current: boolean; file_assets?: { bucket: string; object_path: string } | null }>;
}

function relationOne<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function CoachPlayers({ client, profile, groups }: Props) {
  const [tab, setTab] = useState<PlayerTab>("list");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [players, setPlayers] = useState<PlayerWithUniform[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerWithUniform | null>(null);

  useEffect(() => { if (!groupId && groups[0]) setGroupId(groups[0].id); }, [groupId, groups]);
  const load = useCallback(async () => {
    if (!groupId) { setPlayers([]); setLoading(false); return; }
    setLoading(true); setError(null);
    const result = await client.from("players").select("id, group_id, full_name, first_name, last_name, middle_name, birth_date, birth_year, position, dominant_foot, coach_note, coach_note_author_id, coach_note_author_name, coach_note_updated_at, is_active, groups(code), uniform_requests(id, status), player_photos(is_current, file_assets(bucket, object_path))").eq("group_id", groupId).eq("is_active", true).order("full_name");
    setLoading(false);
    if (result.error) { setError("Не вдалося завантажити список гравців."); return; }
    const next = (result.data ?? []) as unknown as PlayerWithUniform[];
    setPlayers(next);
    const urls: Record<string, string> = {};
    await Promise.all(next.map(async (player) => {
      const asset = player.player_photos?.find((photo) => photo.is_current)?.file_assets;
      if (!asset) return;
      const signed = await client.storage.from(asset.bucket).createSignedUrl(asset.object_path, 600, { transform: { width: 160, height: 160, resize: "cover" } });
      if (signed.data?.signedUrl) urls[player.id] = signed.data.signedUrl;
    }));
    setPhotoUrls(urls);
  }, [client, groupId]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("uk-UA");
    return query ? players.filter((player) => `${player.full_name} ${player.position ?? ""}`.toLocaleLowerCase("uk-UA").includes(query)) : players;
  }, [players, search]);
  const selectedGroup = groups.find((group) => group.id === groupId) ?? groups[0];

  return <div className="workspace-stack"><WorkspaceHeader eyebrow="Команда" title="Гравці" description="Список, щомісячні оплати, форма та «Зірка місяця»" actions={groups.length ? <GroupSelect groups={groups} value={groupId} onChange={setGroupId} /> : undefined} /><Tabs label="Розділи гравців" value={tab} onChange={setTab} items={[{ value: "list", label: "Список гравців", badge: players.length }, { value: "payments", label: "Оплати" }, { value: "uniform", label: "Форма" }, { value: "monthly-star", label: "Зірка місяця" }]} />{error && <StatusMessage kind="error">{error}</StatusMessage>}{loading ? <LoadingState label="Завантажуємо гравців…" /> : tab === "list" ? <><SearchField value={search} onChange={setSearch} placeholder="Пошук за прізвищем або амплуа" />{filtered.length ? <div className="player-grid">{filtered.map((player) => { const issued = relationOne(player.uniform_requests)?.status === "issued"; return <article className="player-list-entry" key={player.id}><button className="player-card" type="button" onClick={() => setSelectedPlayer(player)}>{photoUrls[player.id] ? <Image unoptimized width={64} height={64} src={photoUrls[player.id]} alt="" /> : <span className="avatar-placeholder"><UserRound /></span>}<div><h2>{player.full_name}</h2><p>{player.birth_date ? new Date(player.birth_date).getFullYear() : player.birth_year ?? "Рік не вказано"} · {player.position || "Амплуа не вказано"}</p><Pill tone={issued ? "success" : "warning"}>{issued ? "Формою забезпечено" : "Форма не видана"}</Pill></div><ChevronRight aria-hidden="true" /></button></article>; })}</div> : <EmptyState title="Гравців не знайдено" />}</> : tab === "payments" ? <PaymentsPanel client={client} profile={profile} players={players} /> : tab === "uniform" ? <UniformPanel client={client} profile={profile} players={players} /> : selectedGroup ? <section className="panel-section"><MonthlyStarGroupPanel client={client} profile={profile} group={selectedGroup} /></section> : <EmptyState title="Групу не вибрано" />}{selectedPlayer && <PlayerDetails client={client} profile={profile} player={selectedPlayer} photoUrl={photoUrls[selectedPlayer.id]} onPhotoSaved={() => void load()} onClose={() => setSelectedPlayer(null)} />}</div>;
}

const PLAYER_PHOTO_SOURCE_LIMIT = 25 * 1024 * 1024;
const PLAYER_PHOTO_OUTPUT_LIMIT = 8 * 1024 * 1024;

function normalizePlayerPhoto(file: File) {
  return new Promise<File>((resolve, reject) => {
    const extension = file.name.split(".").pop()?.toLocaleLowerCase("en-US") ?? "";
    if (!file.type.startsWith("image/") && !["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension)) {
      reject(new Error("Оберіть файл зображення."));
      return;
    }
    if (file.size > PLAYER_PHOTO_SOURCE_LIMIT) {
      reject(new Error("Початкове фото завелике. Максимальний розмір — 25 МБ."));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = document.createElement("img");
    image.onload = () => {
      try {
        const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
        const scale = Math.min(1, 1800 / longestSide);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Цей браузер не підтримує підготовку фото.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("Фото не вдалося підготувати. Виберіть JPG, PNG або WebP."));
            return;
          }
          if (blob.size > PLAYER_PHOTO_OUTPUT_LIMIT) {
            reject(new Error("Підготовлене фото завелике. Виберіть інше зображення."));
            return;
          }
          const baseName = file.name.replace(/\.[^.]+$/, "") || "player-photo";
          resolve(new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
        }, "image/jpeg", 0.9);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Цей формат фото не читається на пристрої. Виберіть JPG/PNG або зробіть нове фото камерою."));
    };
    image.src = objectUrl;
  });
}

function PlayerPhotoEditor({ client, profile, player, photoUrl, onSaved }: { client: SupabaseClient; profile: Profile; player: Player; photoUrl?: string; onSaved: () => void | Promise<void> }) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const source = event.target.files?.[0];
    event.target.value = "";
    if (!source) return;
    setBusy(true);
    setMessage(null);
    let asset: FileAsset | null = null;
    try {
      const photo = await normalizePlayerPhoto(source);
      asset = await uploadPrivateFile(client, photo, {
        bucket: "player-photos",
        ownerId: profile.id,
        groupId: player.group_id,
        age: null,
        contextType: "player_photo",
      });
      const result = await client.rpc("set_player_photo", { p_player_id: player.id, p_file_asset_id: asset.id });
      if (result.error) throw result.error;
      setMessage({ kind: "success", text: "Фото гравця оновлено." });
      await onSaved();
      setOpen(false);
    } catch (error) {
      if (asset) {
        try {
          await deletePrivateFile(client, asset);
        } catch {
          /* The unattached asset remains private and can be cleaned up by an administrator. */
        }
      }
      const detail = error instanceof Error ? error.message : "";
      setMessage({
        kind: "error",
        text: detail.includes("row-level security")
          ? "Фото не завантажено через обмеження доступу. Оновіть сторінку та повторіть дію."
          : detail || "Фото не завантажено. Перевірте формат і повторіть дію.",
      });
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="player-photo-trigger" onClick={() => { setMessage(null); setOpen(true); }} aria-label={photoUrl ? `Змінити фото гравця ${player.full_name}` : `Додати фото гравця ${player.full_name}`}>
      {photoUrl ? <Image unoptimized width={112} height={112} src={photoUrl} alt={`Фото ${player.full_name}`} /> : <span className="profile-avatar"><UserRound /></span>}
      <span className="player-photo-badge" aria-hidden="true"><Camera size={16} /></span>
    </button>
    {open && <Modal title="Фото гравця" onClose={() => !busy && setOpen(false)} footer={<button type="button" className="secondary-action" onClick={() => setOpen(false)} disabled={busy}>Закрити</button>}>
      <div className="player-photo-picker">
        <p>Зробіть фото телефоном або виберіть готове з галереї.</p>
        <input ref={cameraInput} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => void choosePhoto(event)} disabled={busy} />
        <input ref={galleryInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" onChange={(event) => void choosePhoto(event)} disabled={busy} />
        <button type="button" className="primary-action" onClick={() => cameraInput.current?.click()} disabled={busy}><Camera size={17} />{busy ? "Обробляємо…" : "Сфотографувати"}</button>
        <button type="button" className="secondary-action" onClick={() => galleryInput.current?.click()} disabled={busy}><ImagePlus size={17} />Вибрати з галереї</button>
        {message && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
      </div>
    </Modal>}
  </>;
}

export function PlayerDetails({ client, profile, player, photoUrl, onPhotoSaved, onClose }: { client: SupabaseClient; profile?: Profile; player: Player; photoUrl?: string; onPhotoSaved?: () => void | Promise<void>; onClose: () => void }) {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [tests, setTests] = useState<Array<{ id: string; measured_on: string; metric_name: string; field_name: string; value: string; unit?: string | null }>>([]);
  const [activity, setActivity] = useState<Array<{ id: string; period: string; metric_name: string; value: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [coachNote, setCoachNote] = useState(player.coach_note ?? "");
  const [coachNoteAuthor, setCoachNoteAuthor] = useState(player.coach_note_author_name ?? null);
  const [coachNoteUpdatedAt, setCoachNoteUpdatedAt] = useState(player.coach_note_updated_at ?? null);
  const [coachNoteBusy, setCoachNoteBusy] = useState(false);
  const [coachNoteSavedValue, setCoachNoteSavedValue] = useState(player.coach_note ?? "");
  const [coachNoteDraftReady, setCoachNoteDraftReady] = useState(false);
  const [coachNoteDraftState, setCoachNoteDraftState] = useState<DraftState>("idle");
  const [coachNoteSaveState, setCoachNoteSaveState] = useState<SaveState>("idle");
  const [coachNoteMessage, setCoachNoteMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const canEditCoachNote = profile?.role === "coach";
  const coachNoteDraftKey = profile ? draftKey(profile.id, `coach-note:${player.id}`) : "";

  useEffect(() => {
    const serverValue = player.coach_note ?? "";
    const local = coachNoteDraftKey ? readDraft<{ note: string }>(coachNoteDraftKey) : null;
    setCoachNote(local?.value.note ?? serverValue);
    setCoachNoteSavedValue(serverValue);
    setCoachNoteAuthor(player.coach_note_author_name ?? null);
    setCoachNoteUpdatedAt(player.coach_note_updated_at ?? null);
    setCoachNoteMessage(null);
    setCoachNoteSaveState(local && local.value.note !== serverValue ? "dirty" : "idle");
    setCoachNoteDraftState(local && local.value.note !== serverValue ? "restored" : "idle");
    setCoachNoteDraftReady(true);
  }, [coachNoteDraftKey, player.coach_note, player.coach_note_author_name, player.coach_note_updated_at]);

  useEffect(() => {
    if (!coachNoteDraftReady || !coachNoteDraftKey || !profile) return;
    if (coachNote === coachNoteSavedValue) {
      clearDraft(coachNoteDraftKey);
      setCoachNoteDraftState("idle");
      setCoachNoteSaveState((state) => state === "dirty" ? "idle" : state);
      return;
    }
    setCoachNoteSaveState((state) => state === "saving" ? state : "dirty");
    setCoachNoteDraftState("saving");
    const timer = window.setTimeout(() => {
      if (writeDraft(coachNoteDraftKey, profile.id, { note: coachNote })) setCoachNoteDraftState("saved");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [coachNote, coachNoteDraftKey, coachNoteDraftReady, coachNoteSavedValue, profile]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      client.from("guardians").select("id, player_id, full_name, relation, phone, email").eq("player_id", player.id).order("created_at"),
      client.from("physical_test_results").select("id, measured_on, metric_name, field_name, value, unit").eq("player_id", player.id).order("measured_on", { ascending: false }),
      client.from("game_activity_results").select("id, period, metric_name, value").eq("player_id", player.id).order("created_at", { ascending: false }),
    ]).then(([guardianResult, testResult, activityResult]) => {
      if (!active) return;
      setGuardians((guardianResult.data ?? []) as Guardian[]);
      setTests((testResult.data ?? []) as typeof tests);
      setActivity((activityResult.data ?? []) as typeof activity);
      setLoading(false);
    });
    return () => { active = false; };
  }, [client, player.id]);

  async function saveCoachNote(event: FormEvent) {
    event.preventDefault();
    if (!profile || profile.role !== "coach") return;
    setCoachNoteBusy(true);
    setCoachNoteSaveState("saving");
    setCoachNoteMessage(null);
    const result = await client.rpc("save_player_coach_note", {
      p_player_id: player.id,
      p_note: coachNote,
    });
    setCoachNoteBusy(false);
    if (result.error) {
      setCoachNoteSaveState("error");
      setCoachNoteMessage({ kind: "error", text: safeError(result.error, "Характеристику не збережено.") });
      return;
    }
    const savedNote = coachNote.trim();
    setCoachNote(savedNote);
    setCoachNoteSavedValue(savedNote);
    setCoachNoteAuthor(profile.full_name);
    setCoachNoteUpdatedAt((result.data as string | null) ?? new Date().toISOString());
    clearDraft(coachNoteDraftKey);
    setCoachNoteDraftState("idle");
    setCoachNoteSaveState("saved");
    setCoachNoteMessage({ kind: "success", text: "Коротку характеристику збережено." });
  }

  return <Modal title={player.full_name} onClose={onClose} wide footer={<button className="primary-action" type="button" onClick={onClose}>Закрити</button>}>
    <div className="player-profile-head">{profile?.role === "coach" && onPhotoSaved ? <PlayerPhotoEditor client={client} profile={profile} player={player} photoUrl={photoUrl} onSaved={onPhotoSaved} /> : photoUrl ? <Image unoptimized width={92} height={92} src={photoUrl} alt={`Фото ${player.full_name}`} /> : <span className="profile-avatar"><UserRound /></span>}<div><Pill tone="plum">{player.groups?.code ?? "Гравець"}</Pill><h3>{player.position || "Амплуа не вказано"}</h3><p>{player.birth_date ? formatDate(player.birth_date) : player.birth_year ? String(player.birth_year) : "Дата народження не вказана"}{player.dominant_foot ? ` · ${player.dominant_foot}` : ""}</p></div></div>
    <section className="profile-section parent-contacts-priority"><h3>Контакти батьків або опікунів</h3>{loading ? <LoadingState /> : guardians.length ? <div className="contact-list">{guardians.map((guardian) => <article key={guardian.id}><b>{guardian.full_name || "Ім’я не вказано"}</b><small>{guardian.relation || "Контактна особа"}</small>{guardian.phone && <a href={`tel:${guardian.phone}`}><Phone size={16} />{guardian.phone}</a>}{guardian.email && <a href={`mailto:${guardian.email}`}><Mail size={16} />{guardian.email}</a>}{!guardian.phone && !guardian.email && <span className="muted">Контакти не внесено</span>}</article>)}</div> : <p className="muted">Контакти не внесено.</p>}</section>
    <section className="profile-section coach-characteristic">
      <h3>Коротка характеристика тренера</h3>
      {canEditCoachNote ? <form className="form-stack" onSubmit={saveCoachNote}>
        <label><span className="sr-only">Коротка характеристика футболіста</span><textarea rows={5} maxLength={2000} value={coachNote} onChange={(event) => setCoachNote(event.target.value)} placeholder="Коротко опишіть сильні сторони, прогрес або робочі спостереження" /></label>
        <DraftStatus state={coachNoteDraftState} onClear={coachNoteDraftState !== "idle" ? () => { clearDraft(coachNoteDraftKey); setCoachNote(coachNoteSavedValue); setCoachNoteDraftState("idle"); setCoachNoteSaveState("idle"); } : undefined} />
        <div className="coach-characteristic-actions"><span><small className="muted">Поле необов’язкове · {coachNote.length}/2000</small><SaveStateLabel state={coachNoteSaveState} /></span><button className={`secondary-action save-action ${coachNoteSaveState}`} disabled={coachNoteBusy || coachNote === coachNoteSavedValue}>{coachNoteBusy ? "Збереження…" : coachNoteSaveState === "saved" ? "Збережено" : "Зберегти характеристику"}</button></div>
        {coachNoteMessage && <StatusMessage kind={coachNoteMessage.kind}>{coachNoteMessage.text}</StatusMessage>}
      </form> : <p className={coachNote ? undefined : "muted"}>{coachNote || "Характеристику ще не додано."}</p>}
      {coachNoteUpdatedAt && <small className="muted">Останнє оновлення: {formatDate(coachNoteUpdatedAt)}{coachNoteAuthor ? ` · ${coachNoteAuthor}` : ""}</small>}
    </section>
    <PlayerAchievementBehavior client={client} profile={profile} player={player} />
    <section className="profile-section"><h3>Результати фізичної підготовленості</h3>{tests.length ? <div className="responsive-table"><table><thead><tr><th>Дата</th><th>Тест</th><th>Поле результату</th><th>Результат</th></tr></thead><tbody>{tests.map((test) => <tr key={test.id}><td>{formatDate(test.measured_on)}</td><td>{test.metric_name}</td><td>{test.field_name}</td><td>{test.value} {test.unit}</td></tr>)}</tbody></table></div> : <p className="muted">Результатів ще немає.</p>}</section>
    <section className="profile-section"><h3>Оцінювання ігрової діяльності</h3>{activity.length ? <div className="responsive-table"><table><thead><tr><th>Період</th><th>Показник</th><th>Результат</th></tr></thead><tbody>{activity.map((item) => <tr key={item.id}><td>{item.period}</td><td>{item.metric_name}</td><td>{item.value}</td></tr>)}</tbody></table></div> : <p className="muted">Результатів ще немає.</p>}</section>
  </Modal>;
}

function PaymentsPanel({ client, profile, players }: { client: SupabaseClient; profile: Profile; players: Player[] }) {
  const [month, setMonth] = useState(toMonthInput());
  const [payments, setPayments] = useState<Record<string, { status: "paid" | "unpaid"; changed_at?: string; profiles?: { full_name: string } | null }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { if (!players.length) { setPayments({}); setLoading(false); return; } setLoading(true); const result = await client.from("monthly_payments").select("player_id, status, changed_at, profiles!monthly_payments_changed_by_fkey(full_name)").in("player_id", players.map((player) => player.id)).eq("month", `${month}-01`); setLoading(false); if (result.error) { setError("Не вдалося завантажити оплати."); return; } const map: typeof payments = {}; for (const item of result.data ?? []) map[item.player_id as string] = item as unknown as typeof payments[string]; setPayments(map); }, [client, month, players]);
  useEffect(() => { void load(); }, [load]);
  async function setStatus(playerId: string, status: "paid" | "unpaid") { setSavingId(playerId); setError(null); const now = new Date().toISOString(); const result = await client.from("monthly_payments").upsert({ player_id: playerId, month: `${month}-01`, status, changed_by: profile.id, changed_at: now }, { onConflict: "player_id,month" }); setSavingId(null); if (result.error) { setError("Статус не збережено."); return; } setPayments((value) => ({ ...value, [playerId]: { status, changed_at: now, profiles: { full_name: profile.full_name } } })); }
  return <section className="panel-section"><div className="section-title-row"><div><p className="eyebrow">Щомісячний контроль</p><h2>{formatMonth(month)}</h2></div><label className="compact-field"><span>Місяць</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label></div>{error && <StatusMessage kind="error">{error}</StatusMessage>}{loading ? <LoadingState /> : players.length ? <div className="payment-list">{players.map((player) => { const row = payments[player.id]; const status = row?.status ?? "unpaid"; return <div className="payment-row" key={player.id}><div><b>{player.full_name}</b>{row?.changed_at && <small>Змінено {formatDate(row.changed_at)} · {row.profiles?.full_name ?? "користувач"}</small>}</div><div className="binary-choice" aria-label={`Оплата ${player.full_name}`}><button className={status === "paid" ? "selected paid" : ""} disabled={savingId === player.id} onClick={() => void setStatus(player.id, "paid")}><Check size={16} />Оплачено</button><button className={status === "unpaid" ? "selected unpaid" : ""} disabled={savingId === player.id} onClick={() => void setStatus(player.id, "unpaid")}>Не оплачено</button></div></div>; })}</div> : <EmptyState title="Гравців у команді немає" />}</section>;
}

function UniformPanel({ client, profile, players }: { client: SupabaseClient; profile: Profile; players: Player[] }) {
  const [catalog, setCatalog] = useState<UniformCatalogItem[]>([]);
  const [requests, setRequests] = useState<UniformRequest[]>([]);
  const [selected, setSelected] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); const [catalogResult, requestResult] = await Promise.all([client.from("uniform_catalog_items").select("id, name, sizes, is_active").eq("is_active", true).order("sort_order"), players.length ? client.from("uniform_requests").select("id, player_id, number, surname_print, status, admin_note, uniform_request_items(id, catalog_item_id, size, quantity, uniform_catalog_items(id, name, sizes, is_active))").in("player_id", players.map((player) => player.id)) : Promise.resolve({ data: [], error: null })]); setCatalog((catalogResult.data ?? []) as UniformCatalogItem[]); setRequests((requestResult.data ?? []) as unknown as UniformRequest[]); setLoading(false); }, [client, players]);
  useEffect(() => { void load(); }, [load]);
  return <section className="panel-section"><div className="section-title-row"><div><p className="eyebrow">Екіпірування</p><h2>Форма гравців</h2></div><Pill tone="plum">{requests.filter((request) => request.status === "requested").length} запитів</Pill></div>{loading ? <LoadingState /> : players.length ? <div className="uniform-player-list">{players.map((player) => { const request = requests.find((item) => item.player_id === player.id); return <button type="button" key={player.id} onClick={() => setSelected(player)}><span className="tile-icon coral"><Shirt /></span><div><b>{player.full_name}</b><small>{request ? `${UNIFORM_STATUS_LABELS[request.status]}${request.number ? ` · № ${request.number}` : ""}` : "Не замовлено"}</small></div><ChevronRight /></button>; })}</div> : <EmptyState title="Гравців у команді немає" />}{selected && <UniformRequestModal client={client} profile={profile} player={selected} catalog={catalog} request={requests.find((item) => item.player_id === selected.id)} onClose={() => setSelected(null)} onSaved={() => { void load(); }} />}</section>;
}

function UniformRequestModal({ client, profile, player, catalog, request, onClose, onSaved }: { client: SupabaseClient; profile: Profile; player: Player; catalog: UniformCatalogItem[]; request?: UniformRequest; onClose: () => void; onSaved: () => void }) {
  const locked = request?.status === "preparing" || request?.status === "issued";
  const [number, setNumber] = useState(request?.number?.toString() ?? "");
  const [surname, setSurname] = useState(request?.surname_print ?? player.last_name ?? player.full_name.split(" ")[0]);
  const initialItems = useMemo(() => Object.fromEntries((request?.uniform_request_items ?? []).map((item) => [item.catalog_item_id, { selected: true, size: item.size }])), [request?.uniform_request_items]);
  const [items, setItems] = useState<Record<string, { selected: boolean; size: string }>>(initialItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [draftState, setDraftState] = useState<DraftState>("idle");
  const [draftReady, setDraftReady] = useState(false);
  const initialValue = useMemo(() => ({ number: request?.number?.toString() ?? "", surname: request?.surname_print ?? player.last_name ?? player.full_name.split(" ")[0], items: initialItems }), [initialItems, player.full_name, player.last_name, request?.number, request?.surname_print]);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [undoValue, setUndoValue] = useState<typeof initialValue | null>(null);
  const uniformDraftKey = draftKey(profile.id, `uniform-request:${player.id}`);
  const currentValue = useMemo(() => ({ number, surname, items }), [items, number, surname]);
  const currentSerialized = JSON.stringify(currentValue);
  const savedSerialized = JSON.stringify(savedValue);

  useEffect(() => {
    const local = readDraft<typeof initialValue>(uniformDraftKey);
    if (local && JSON.stringify(local.value) !== JSON.stringify(initialValue)) {
      setNumber(local.value.number);
      setSurname(local.value.surname);
      setItems(local.value.items);
      setSaveState("dirty");
      setDraftState("restored");
    }
    setDraftReady(true);
  }, [initialValue, uniformDraftKey]);

  useEffect(() => {
    if (!draftReady) return;
    if (currentSerialized === savedSerialized) {
      clearDraft(uniformDraftKey);
      setDraftState("idle");
      setSaveState((state) => state === "dirty" ? "idle" : state);
      return;
    }
    setSaveState((state) => state === "saving" ? state : "dirty");
    setDraftState("saving");
    const timer = window.setTimeout(() => {
      if (writeDraft(uniformDraftKey, profile.id, currentValue)) setDraftState("saved");
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentSerialized, currentValue, draftReady, profile.id, savedSerialized, uniformDraftKey]);

  async function persist(value: typeof initialValue) {
    const selectedItems = catalog
      .filter((item) => value.items[item.id]?.selected)
      .map((item) => ({
        catalog_item_id: item.id,
        size: value.items[item.id].size || item.sizes[0] || "Не вказано",
      }));
    return client.rpc("save_uniform_request", {
      p_player_id: player.id,
      p_number: value.number ? Number(value.number) : null,
      p_surname_print: value.surname,
      p_items: selectedItems,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked) {
      setError("Запит уже опрацьовує адміністратор, тому редагування заблоковано.");
      return;
    }
    if (!profile.id) {
      setError("Сесію користувача не підтверджено.");
      return;
    }
    setBusy(true);
    setSaveState("saving");
    setError(null);
    const previous = savedValue;
    const result = await persist(currentValue);
    setBusy(false);
    if (result.error) {
      setSaveState("error");
      setError(safeError(result.error, "Запит на форму не збережено."));
      return;
    }
    setSavedValue(currentValue);
    setUndoValue(previous);
    clearDraft(uniformDraftKey);
    setDraftState("idle");
    setSaveState("saved");
    onSaved();
  }

  async function undo() {
    if (!undoValue) return;
    setBusy(true);
    const result = await persist(undoValue);
    setBusy(false);
    if (result.error) {
      setSaveState("error");
      setError("Останню зміну не скасовано.");
      return;
    }
    setNumber(undoValue.number);
    setSurname(undoValue.surname);
    setItems(undoValue.items);
    setSavedValue(undoValue);
    setUndoValue(null);
    clearDraft(uniformDraftKey);
    setDraftState("idle");
    setSaveState("saved");
    setError(null);
    onSaved();
  }

  if (locked) return <Modal title={`Форма · ${player.full_name}`} onClose={onClose} wide footer={<button className="primary-action" type="button" onClick={onClose}>Закрити</button>}><StatusMessage kind="warning">Запит має стан «{UNIFORM_STATUS_LABELS[request.status]}». Тренер може його переглядати, але змінює лише адміністратор.</StatusMessage><div className="detail-list"><div><Shirt /><span><b>{request.surname_print || "Без нанесення"}{request.number != null ? ` · № ${request.number}` : ""}</b><small>{(request.uniform_request_items ?? []).map((item) => `${item.uniform_catalog_items?.name ?? "Позиція"} · ${item.size}`).join(", ") || "Позицій немає"}</small></span></div></div>{request.admin_note && <div className="text-block"><h3>Коментар адміністратора</h3><p>{request.admin_note}</p></div>}</Modal>;
  return <Modal title={`Форма · ${player.full_name}`} onClose={onClose} wide footer={<><SaveStateLabel state={saveState} />{undoValue && saveState === "saved" && <UndoLastChange busy={busy} onUndo={undo} />}<button className="secondary-action" type="button" onClick={onClose}>Закрити</button><button className={`primary-action save-action ${saveState}`} form="uniform-request" disabled={busy || currentSerialized === savedSerialized}>{busy ? "Збереження…" : saveState === "saved" ? "Збережено" : "Зберегти запит"}</button></>}><form id="uniform-request" className="form-grid" onSubmit={save}><div className="span-2"><DraftStatus state={draftState} onClear={draftState !== "idle" ? () => { clearDraft(uniformDraftKey); setNumber(savedValue.number); setSurname(savedValue.surname); setItems(savedValue.items); setDraftState("idle"); setSaveState("idle"); } : undefined} /></div><label><span>Номер</span><input type="number" min={0} max={99} value={number} onChange={(e) => setNumber(e.target.value)} /></label><label><span>Прізвище для нанесення</span><input value={surname} onChange={(e) => setSurname(e.target.value)} /></label><div className="span-2 equipment-picker"><h3>Потрібні позиції та розміри</h3>{catalog.map((item) => <div key={item.id}><label className="check-field"><input type="checkbox" checked={items[item.id]?.selected ?? false} onChange={(e) => setItems((value) => ({ ...value, [item.id]: { selected: e.target.checked, size: value[item.id]?.size || item.sizes[0] || "" } }))} /><span>{item.name}</span></label><select disabled={!items[item.id]?.selected} value={items[item.id]?.size ?? item.sizes[0] ?? ""} onChange={(e) => setItems((value) => ({ ...value, [item.id]: { selected: true, size: e.target.value } }))}>{item.sizes.map((size) => <option key={size}>{size}</option>)}</select></div>)}</div>{error && <div className="span-2"><StatusMessage kind="error">{error}</StatusMessage></div>}</form></Modal>;
}
