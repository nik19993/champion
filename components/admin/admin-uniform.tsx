"use client";

import { groupCode } from "@/lib/domain/seasons";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Archive, ArchiveRestore, Plus, Shirt, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  LoadingState,
  Modal,
  Pill,
  SearchField,
  StatusMessage,
  Tabs,
  WorkspaceHeader,
} from "@/components/common/workspace-ui";
import { SaveStateLabel, UndoLastChange, type SaveState } from "@/components/common/save-feedback";
import { formatDate, UNIFORM_STATUS_LABELS } from "@/lib/domain/format";
import { clearDraft, draftKey, readDraft, writeDraft } from "@/lib/offline/drafts";
import type {
  GroupSummary,
  Profile,
  UniformCatalogItem,
  UniformRequest,
  UniformStatus,
} from "@/lib/domain/types";

interface RequestRow extends Omit<UniformRequest, "players"> {
  issued_at: string | null;
  players?: {
    id: string;
    full_name: string;
    groups?: { id: string; code: string } | null;
  } | null;
}

type UniformView = "pending" | "archive";
type PendingStatus = Exclude<UniformStatus, "issued"> | "all";

const pendingStatusOptions = Object.entries(UNIFORM_STATUS_LABELS).filter(
  ([value]) => value !== "issued",
);

function isArchivedRequest(request: Pick<RequestRow, "status" | "issued_at">) {
  return request.status === "issued" && Boolean(request.issued_at);
}

export function AdminUniform({
  client,
  profile,
  groups,
}: {
  client: SupabaseClient;
  profile: Profile;
  groups: GroupSummary[];
}) {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [catalog, setCatalog] = useState<UniformCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<UniformView>("pending");
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState("all");
  const [status, setStatus] = useState<PendingStatus>("all");
  const [catalogItemId, setCatalogItemId] = useState("all");
  const isArchive = view === "archive";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [requestResult, catalogResult] = await Promise.all([
      client
        .from("uniform_requests")
        .select(
          "id, player_id, number, surname_print, status, admin_note, issued_at, players(id, full_name, groups(id, code)), uniform_request_items(id, catalog_item_id, size, quantity, uniform_catalog_items(id, name, sizes, is_active))",
        )
        .order("updated_at", { ascending: false }),
      client
        .from("uniform_catalog_items")
        .select("id, name, sizes, sort_order, is_active")
        .order("sort_order")
        .order("name"),
    ]);
    setLoading(false);
    if (requestResult.error || catalogResult.error) {
      setError("Не вдалося завантажити форму та її каталог.");
      return;
    }
    setRequests((requestResult.data ?? []) as unknown as RequestRow[]);
    const nextCatalog = (catalogResult.data ?? []) as unknown as UniformCatalogItem[];
    setCatalog(nextCatalog);
    setCatalogItemId((current) =>
      current === "all" || nextCatalog.some((item) => item.id === current && item.is_active) ? current : "all",
    );
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const catalogItems = useMemo(
    () => catalog.filter((item) => item.is_active),
    [catalog],
  );
  const counts = useMemo(() => {
    let pending = 0;
    let archive = 0;
    for (const request of requests) {
      if (request.status !== "issued") pending++;
      else if (isArchivedRequest(request)) archive++;
    }
    return { pending, archive };
  }, [requests]);

  const filtered = useMemo(() => {
    const matching = requests.filter((request) => {
      if (isArchive ? !isArchivedRequest(request) : request.status === "issued") return false;
      const player = request.players;
      if (groupId !== "all" && player?.groups?.id !== groupId) return false;
      if (!isArchive && status !== "all" && request.status !== status) return false;
      if (
        catalogItemId !== "all" &&
        !(request.uniform_request_items ?? []).some(
          (item) => item.catalog_item_id === catalogItemId,
        )
      ) {
        return false;
      }
      return (
        !search.trim() ||
        `${player?.full_name ?? ""} ${request.surname_print ?? ""}`
          .toLocaleLowerCase("uk-UA")
          .includes(search.trim().toLocaleLowerCase("uk-UA"))
      );
    });
    return isArchive
      ? matching.sort((a, b) => Date.parse(b.issued_at ?? "") - Date.parse(a.issued_at ?? ""))
      : matching;
  }, [catalogItemId, groupId, isArchive, requests, search, status]);

  const summary = useMemo(() => {
    const map = new Map<string, number>();
    for (const request of filtered.filter(
      (row) => row.status === "requested" || row.status === "preparing",
    )) {
      for (const item of request.uniform_request_items ?? []) {
        const name = item.uniform_catalog_items?.name ?? "Позиція";
        const key = `${name} · ${item.size}`;
        map.set(key, (map.get(key) ?? 0) + item.quantity);
      }
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "uk"));
  }, [filtered]);

  async function update(request: RequestRow, nextStatus: UniformStatus, note: string) {
    setNotice(null);
    const result = await client
      .from("uniform_requests")
      .update({ status: nextStatus, admin_note: note || null })
      .eq("id", request.id)
      .select("id, status, admin_note, issued_at").single();
    const saved = result.data as Pick<RequestRow, "id" | "status" | "admin_note" | "issued_at"> | null;
    if (result.error || saved?.id !== request.id) {
      setError("Зміни не збережено.");
      return false;
    }
    setRequests((rows) =>
      rows.map((row) =>
        row.id === request.id
          ? { ...row, ...saved }
          : row,
      ),
    );
    setError(null);
    if (!isArchivedRequest(request) && isArchivedRequest(saved)) {
      setNotice("Видачу збережено. Запис перенесено в архів видач.");
    } else if (request.status === "issued" && saved.status !== "issued") {
      setNotice("Стан збережено. Запис повернуто до списку «До видачі».");
    }
    return true;
  }

  return (
    <div className="workspace-stack">
      <WorkspaceHeader
        eyebrow="Замовлення екіпірування"
        title="Форма"
        description="Запити гравців, архів видач і каталог екіпірування"
      />

      <UniformCatalogManager
        client={client}
        catalog={catalog}
        onChanged={load}
      />

      <Tabs<UniformView>
        label="Списки видачі форми"
        value={view}
        onChange={(nextView) => { setView(nextView); setNotice(null); }}
        items={[
          { value: "pending", label: "До видачі", badge: loading ? undefined : counts.pending },
          { value: "archive", label: "Архів видач", badge: loading ? undefined : counts.archive },
        ]}
      />

      <section className="filter-bar uniform-filters">
        <SearchField value={search} onChange={setSearch} placeholder="Пошук гравця" />
        <label>
          <span>Команда</span>
          <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            <option value="all">Усі команди</option>
            {groups.map((group) => (
              <option value={group.id} key={group.id}>
                {groupCode(group)}
              </option>
            ))}
          </select>
        </label>
        {!isArchive && <label>
          <span>Стан</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as PendingStatus)
            }
          >
            <option value="all">Усі стани</option>
            {pendingStatusOptions.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>}
        <label>
          <span>Позиція форми</span>
          <select
            value={catalogItemId}
            onChange={(event) => setCatalogItemId(event.target.value)}
          >
            <option value="all">Усі позиції</option>
            {catalogItems.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && <StatusMessage kind="error">{error}</StatusMessage>}
      {notice && <StatusMessage kind="success">{notice}</StatusMessage>}
      {loading ? (
        <LoadingState />
      ) : filtered.length ? (
        <>
          <div className="uniform-admin-list">
            {filtered.map((request) => (
              <UniformAdminRow request={request} profileId={profile.id} key={request.id} onSave={update} />
            ))}
          </div>
          {!isArchive && <section className="panel-section order-summary">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Стани «Запитано» і «Готується»</p>
                <h2>Що потрібно замовити або підготувати</h2>
              </div>
              <Pill tone="plum">
                {summary.reduce((sum, [, count]) => sum + count, 0)} одиниць
              </Pill>
            </div>
            {summary.length ? (
              <div className="summary-chips">
                {summary.map(([key, count]) => (
                  <span key={key}>
                    <b>{count}</b>
                    {key}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">Активних позицій для замовлення немає.</p>
            )}
          </section>}
        </>
      ) : (
        <EmptyState title={isArchive
          ? counts.archive ? "В архіві немає видач за вибраними фільтрами" : "Архів видач порожній"
          : "Немає запитів до видачі за вибраними фільтрами"} />
      )}
    </div>
  );
}

function UniformCatalogManager({
  client,
  catalog,
  onChanged,
}: {
  client: SupabaseClient;
  catalog: UniformCatalogItem[];
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [sizes, setSizes] = useState("");
  const [busy, setBusy] = useState<"add" | "toggle" | "remove" | null>(null);
  const [removeTarget, setRemoveTarget] = useState<UniformCatalogItem | null>(null);
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const activeItems = catalog.filter((item) => item.is_active);
  const hiddenItems = catalog.filter((item) => !item.is_active);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("add");
    setMessage(null);
    const parsedSizes = [
      ...new Set(
        sizes
          .split(/[,;\n]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    const result = await client.from("uniform_catalog_items").insert({
      name: name.trim(),
      sizes: parsedSizes,
      sort_order: catalog.length
        ? Math.max(...catalog.map((item) => Number(item.sort_order ?? 0))) + 1
        : 1,
      is_active: true,
    });
    setBusy(null);
    if (result.error) {
      setMessage({ kind: "error", text: "Позицію форми не додано." });
      return;
    }
    setName("");
    setSizes("");
    setMessage({ kind: "success", text: "Нову позицію форми додано." });
    await onChanged();
  }

  async function toggle(item: UniformCatalogItem) {
    if (busy) return;
    setBusy("toggle");
    setMessage(null);
    const result = await client
      .from("uniform_catalog_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id)
      .select("id")
      .maybeSingle();
    setBusy(null);
    if (result.error || result.data?.id !== item.id) {
      setMessage({ kind: "error", text: "Стан позиції не змінено." });
      return;
    }
    await onChanged();
  }

  async function remove() {
    if (!removeTarget || busy) return;
    const item = removeTarget;
    setBusy("remove");
    setMessage(null);
    try {
      const deleted = await client.from("uniform_catalog_items").delete().eq("id", item.id).select("id").maybeSingle();
      if (deleted.error?.code === "23503") {
        const hidden = await client.from("uniform_catalog_items").update({ is_active: false }).eq("id", item.id).select("id").maybeSingle();
        if (hidden.error || hidden.data?.id !== item.id) throw new Error("POSITION_NOT_HIDDEN");
        setMessage({ kind: "success", text: `«${item.name}» прибрано з пропозицій. Попередні заявки збережено.` });
      } else {
        if (deleted.error || deleted.data?.id !== item.id) throw new Error("POSITION_NOT_DELETED");
        setMessage({ kind: "success", text: `«${item.name}» видалено з каталогу.` });
      }
      setRemoveTarget(null);
      await onChanged();
    } catch {
      setMessage({ kind: "error", text: "Не вдалося прибрати позицію. Перевірте доступ і повторіть спробу." });
    } finally {
      setBusy(null);
    }
  }

  function catalogItem(item: UniformCatalogItem) {
    const ToggleIcon = item.is_active ? Archive : ArchiveRestore;
    const toggleLabel = item.is_active ? "Приховати" : "Повернути";
    return (
      <span key={item.id} className={!item.is_active ? "inactive" : ""}>
        <b>{item.name}</b>
        {item.sizes.length ? item.sizes.join(", ") : "без фіксованих розмірів"}
        <button type="button" className="icon-action" disabled={Boolean(busy)} aria-label={`${toggleLabel} ${item.name}`} title={toggleLabel} onClick={() => void toggle(item)}>
          <ToggleIcon size={16} />
        </button>
        <button type="button" className="text-action uniform-remove-action" disabled={Boolean(busy)} aria-label={`Видалити ${item.name}`} onClick={() => { setMessage(null); setRemoveTarget(item); }}>
          <Trash2 size={16} /> Видалити
        </button>
      </span>
    );
  }

  return (
    <section className="panel-section uniform-catalog-admin">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Каталог екіпірування</p>
          <h2>Позиції та доступні розміри</h2>
        </div>
        <Pill tone="plum">{activeItems.length} активних</Pill>
      </div>
      {message && !removeTarget && <StatusMessage kind={message.kind}>{message.text}</StatusMessage>}
      <form className="inline-add-form" onSubmit={add}>
        <label>
          <span>Нова позиція</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Наприклад, тренувальна шапка"
            required
          />
        </label>
        <label>
          <span>Розміри через кому</span>
          <input
            value={sizes}
            onChange={(event) => setSizes(event.target.value)}
            placeholder="128, 140, 152, S, M"
          />
        </label>
        <button className="primary-action" disabled={Boolean(busy)}>
          <Plus size={17} />
          {busy === "add" ? "Додавання…" : "Додати позицію"}
        </button>
      </form>
      {activeItems.length ? <div className="summary-chips uniform-catalog-chips">{activeItems.map(catalogItem)}</div> : <p className="muted">У каталозі немає активних позицій.</p>}
      {hiddenItems.length > 0 && <details className="uniform-catalog-hidden">
        <summary>Приховані позиції ({hiddenItems.length})</summary>
        <div className="summary-chips uniform-catalog-chips">{hiddenItems.map(catalogItem)}</div>
      </details>}
      {removeTarget && <Modal title="Видалити позицію форми?" onClose={() => { if (!busy) { setRemoveTarget(null); setMessage(null); } }} footer={<>
        <button type="button" className="secondary-action" disabled={Boolean(busy)} onClick={() => { setRemoveTarget(null); setMessage(null); }}>Скасувати</button>
        <button type="button" className="danger-action" disabled={Boolean(busy)} onClick={() => void remove()}>{busy === "remove" ? "Видалення…" : "Видалити"}</button>
      </>}>
        <p><b>{removeTarget.name}</b></p>
        <p>Якщо позицію вже додано до заявок, вона зникне з пропозицій для нових замовлень, а попередні заявки збережуться.</p>
        {message?.kind === "error" && <StatusMessage kind="error">{message.text}</StatusMessage>}
      </Modal>}
    </section>
  );
}

function UniformAdminRow({
  request,
  profileId,
  onSave,
}: {
  request: RequestRow;
  profileId: string;
  onSave: (
    request: RequestRow,
    status: UniformStatus,
    note: string,
  ) => Promise<boolean>;
}) {
  const [status, setStatus] = useState(request.status);
  const [note, setNote] = useState(request.admin_note ?? "");
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const initialValue = useMemo(() => ({ status: request.status, note: request.admin_note ?? "" }), [request.admin_note, request.status]);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [undoValue, setUndoValue] = useState<typeof initialValue | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const rowDraftKey = draftKey(profileId, `admin-uniform:${request.id}`);
  const currentValue = useMemo(() => ({ status, note }), [note, status]);
  const currentSerialized = JSON.stringify(currentValue);
  const savedSerialized = JSON.stringify(savedValue);

  useEffect(() => {
    const local = readDraft<typeof initialValue>(rowDraftKey);
    if (local && JSON.stringify(local.value) !== JSON.stringify(initialValue)) {
      setStatus(local.value.status);
      setNote(local.value.note);
      setSaveState("dirty");
    }
    setDraftReady(true);
  }, [initialValue, rowDraftKey]);

  useEffect(() => {
    if (!draftReady) return;
    if (currentSerialized === savedSerialized) {
      clearDraft(rowDraftKey);
      setSaveState((state) => state === "dirty" ? "idle" : state);
      return;
    }
    setSaveState((state) => state === "saving" ? state : "dirty");
    const timer = window.setTimeout(() => writeDraft(rowDraftKey, profileId, currentValue), 400);
    return () => window.clearTimeout(timer);
  }, [currentSerialized, currentValue, draftReady, profileId, rowDraftKey, savedSerialized]);

  async function save() {
    setBusy(true);
    setSaveState("saving");
    const previous = savedValue;
    const saved = await onSave(request, status, note);
    setBusy(false);
    if (!saved) {
      setSaveState("error");
      return;
    }
    setSavedValue(currentValue);
    setUndoValue(previous);
    clearDraft(rowDraftKey);
    setSaveState("saved");
  }

  async function undo() {
    if (!undoValue) return;
    setBusy(true);
    const saved = await onSave(request, undoValue.status, undoValue.note);
    setBusy(false);
    if (!saved) {
      setSaveState("error");
      return;
    }
    setStatus(undoValue.status);
    setNote(undoValue.note);
    setSavedValue(undoValue);
    setUndoValue(null);
    clearDraft(rowDraftKey);
    setSaveState("saved");
  }

  return (
    <article className={`save-surface ${saveState}`}>
      <div className="uniform-admin-player">
        <span className="tile-icon coral">
          <Shirt />
        </span>
        <div>
          <h2>{request.players?.full_name ?? "Гравець"}</h2>
          <p>
            {groupCode(request.players?.groups)} · {request.surname_print || "без нанесення"}
            {request.number != null ? ` · № ${request.number}` : ""}
          </p>
          {request.issued_at && <p>Дата видачі: <time dateTime={request.issued_at}>{formatDate(request.issued_at)}</time></p>}
        </div>
      </div>
      <div className="uniform-item-chips">
        {(request.uniform_request_items ?? []).map((item) => (
          <span key={item.id}>
            {item.uniform_catalog_items?.name ?? "Позиція"} · {item.size} · {item.quantity} шт.
          </span>
        ))}
      </div>
      <label>
        <span>Стан</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as UniformStatus)}
        >
          {Object.entries(UNIFORM_STATUS_LABELS).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="uniform-note">
        <span>Коментар</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Необов’язково"
        />
      </label>
      <div className="save-control">
        <button type="button" className={`secondary-action save-action ${saveState}`} disabled={busy || currentSerialized === savedSerialized} onClick={() => void save()}>{busy ? "Збереження…" : saveState === "saved" ? "Збережено" : saveState === "error" ? "Повторити" : "Зберегти"}</button>
        <SaveStateLabel state={saveState} />
        {undoValue && saveState === "saved" && <UndoLastChange busy={busy} onUndo={undo} />}
      </div>
    </article>
  );
}
