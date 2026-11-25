"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Modal, StatusMessage } from "@/components/common/workspace-ui";
import { AGE_GROUP_VALUES } from "@/lib/domain/age-groups";
import { ageGroupCode, GROUP_SUFFIX_VALUES, groupCreationError, nextGroupSuffix } from "@/lib/domain/group-creation";
import type { GroupSummary } from "@/lib/domain/types";
import { GROUP_SUMMARY_SELECT, LOCATION_CATEGORIES, locationGroupCode, type ClubLocation, type LocationCategory } from "@/lib/domain/location-groups";
import { VENUE_SELECT, isAwayVenue } from "@/lib/domain/venue-booking";
import type { Venue } from "@/lib/domain/types";

export function GroupCreation({ client, groups, onCreated, onMfaRequired, initialKind = "main" }: { client: SupabaseClient; groups: GroupSummary[]; onCreated: (group: GroupSummary) => void; onMfaRequired?: () => void; initialKind?: "main" | "location" }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"main" | "location">("main");
  const [locations, setLocations] = useState<ClubLocation[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [locationId, setLocationId] = useState("");
  const [schoolNumber, setSchoolNumber] = useState("");
  const [locationName, setLocationName] = useState("");
  const [venueId, setVenueId] = useState("");
  const [category, setCategory] = useState<LocationCategory>("A");
  const [locationsReady, setLocationsReady] = useState(false);
  const [age, setAge] = useState(6);
  const [suffix, setSuffix] = useState(() => nextGroupSuffix(groups, 6));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const pending = useRef<{ code: string; id: string } | null>(null);
  const saving = useRef(false);
  const selectedLocation = locations.find((location) => location.id === locationId);
  const school = selectedLocation?.school_number ?? Number(schoolNumber);
  const code = kind === "main" ? ageGroupCode(age, suffix) : locationGroupCode(school, category);
  const duplicate = groups.some((group) => (group.display_code ?? group.code) === code || group.code === code);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLocationsReady(false);
    void Promise.all([
      client.from("club_locations").select("id, school_number, name, venue_id").eq("is_active", true).order("school_number"),
      client.from("venues").select(VENUE_SELECT).eq("is_active", true).order("name"),
    ]).then(([locationResult, venueResult]) => {
      if (!active) return;
      if (locationResult.error || venueResult.error) { setError("Не вдалося завантажити локації. Закрийте вікно та повторіть спробу."); return; }
      const rows = (locationResult.data ?? []) as ClubLocation[];
      setLocations(rows);
      setVenues(((venueResult.data ?? []) as Venue[]).filter((venue) => !isAwayVenue(venue) && !venue.parent_venue_id));
      setLocationId((current) => current || rows[0]?.id || "new");
      setLocationsReady(true);
    });
    return () => { active = false; };
  }, [client, open]);

  function begin() {
    setKind(initialKind);
    setSuffix(nextGroupSuffix(groups, age));
    setError(null);
    setSuccess(null);
    pending.current = null;
    setOpen(true);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!code || duplicate || saving.current || (kind === "location" && !locationsReady)) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      if (pending.current?.code !== code) pending.current = { code, id: crypto.randomUUID() };
      const refreshed = await client.auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance.error || assurance.data?.currentLevel !== "aal2") {
        onMfaRequired?.();
        throw new Error("MFA_REQUIRED");
      }
      const result = kind === "main" ? await client.rpc("create_age_group", {
        p_age: age,
        p_team_suffix: suffix || null,
        p_request_id: pending.current.id,
      }).abortSignal(AbortSignal.timeout(20000)).single() : await client.rpc("create_location_group", {
        p_school_number: school,
        p_category: category,
        p_request_id: pending.current.id,
        p_location_name: selectedLocation?.name ?? (locationName.trim() || null),
        p_venue_id: selectedLocation?.venue_id ?? (venueId || null),
      }).abortSignal(AbortSignal.timeout(20000)).single();
      if (result.error) throw result.error;
      const createdId = (result.data as { id?: unknown } | null)?.id;
      if (typeof createdId !== "string") throw new Error("INVALID_RESPONSE");
      const summary = await client.from("groups").select(GROUP_SUMMARY_SELECT).eq("id", createdId).single();
      if (summary.error) throw summary.error;
      const created = summary.data as unknown as GroupSummary;
      if (!created?.id || !created.code) throw new Error("INVALID_RESPONSE");
      onCreated(created);
      setSuccess(`Групу ${created.display_code ?? created.code} створено${created.season ? ` · сезон ${created.season}` : ""}. Її вже можна призначити тренеру.`);
      setOpen(false);
      pending.current = null;
    } catch (caught) {
      setError(groupCreationError(caught));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <>
    <div className="section-title-row group-creation-toolbar"><div><h3>Групи клубу</h3><p className="muted">Додавайте основні групи та групи локацій поступово, а потім призначайте тренерів.</p></div><button className="secondary-action" type="button" onClick={begin}><Plus size={18} />Додати групу</button></div>
    {success && <StatusMessage kind="success">{success}</StatusMessage>}
    {open && <Modal title="Додати групу" onClose={() => !saving.current && setOpen(false)} footer={<><button className="secondary-action" type="button" disabled={busy} onClick={() => setOpen(false)}>Скасувати</button><button className="primary-action" form="create-age-group" disabled={busy || !code || duplicate}>{busy ? "Створення…" : "Створити групу"}</button></>}>
      <form id="create-age-group" className="form-stack" onSubmit={create}>
        <label><span>Тип групи</span><select value={kind} disabled={busy} onChange={(event) => { setKind(event.target.value as "main" | "location"); setError(null); }}><option value="main">Основна група</option><option value="location">Група локації</option></select></label>
        {kind === "main" ? <><label><span>Вікова категорія</span><select value={age} disabled={busy} onChange={(event) => { const nextAge = Number(event.target.value); setAge(nextAge); setSuffix(nextGroupSuffix(groups, nextAge)); setError(null); }}>{AGE_GROUP_VALUES.map((value) => <option key={value} value={value}>U{value}</option>)}</select></label>
        <label><span>Літера групи</span><select value={suffix} disabled={busy} onChange={(event) => { setSuffix(event.target.value); setError(null); }}>{age < 8 && <option value="">Без літери</option>}{GROUP_SUFFIX_VALUES.map((letter) => <option key={letter} value={letter}>{letter}</option>)}</select></label>
        </> : <>
          <label><span>Локація</span><select value={locationId} disabled={busy || !locationsReady} onChange={(event) => { setLocationId(event.target.value); setVenueId(""); setError(null); }}>{!locationsReady && <option value="">Завантажуємо…</option>}{locations.map((location) => <option key={location.id} value={location.id}>№ {location.school_number} · {location.name}</option>)}<option value="new">Додати нову локацію</option></select></label>
          {locationId === "new" && <><label><span>Номер локації / школи</span><input type="number" min={1} max={9999} step={1} value={schoolNumber} onChange={(event) => setSchoolNumber(event.target.value)} required /></label><label><span>Назва локації</span><input value={locationName} maxLength={160} onChange={(event) => setLocationName(event.target.value)} placeholder="Наприклад, ЗОШ № 2" /></label></>}
          {!selectedLocation?.venue_id && <label><span>Місце тренувань</span><select value={venueId} disabled={busy} onChange={(event) => setVenueId(event.target.value)}><option value="">Спортивний зал цієї локації</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>}
          <label><span>Вікова категорія</span><select value={category} disabled={busy} onChange={(event) => setCategory(event.target.value as LocationCategory)}>{Object.entries(LOCATION_CATEGORIES).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
          <p className="muted">Місце тренування закріплюється за локацією. Тренер не вибирає його під час планування тренування.</p>
        </>}
        <p className="group-creation-preview">Назва групи: <strong>{code ?? "Перевірте дані"}</strong></p>
        <p className="muted">{kind === "main" && "Сезон і рік народження визначаються автоматично за поточним сезоном клубу. "}Групу можна створити без гравців та без призначеного тренера.</p>
        {duplicate && <StatusMessage kind="warning">Група {code} вже існує. Виберіть іншу літеру.</StatusMessage>}
        {error && <StatusMessage kind="error">{error}</StatusMessage>}
      </form>
    </Modal>}
  </>;
}
