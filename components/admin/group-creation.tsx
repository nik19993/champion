"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Plus } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Modal, StatusMessage } from "@/components/common/workspace-ui";
import { AGE_GROUP_VALUES } from "@/lib/domain/age-groups";
import { ageGroupCode, GROUP_SUFFIX_VALUES, groupCreationError, nextGroupSuffix } from "@/lib/domain/group-creation";
import type { GroupSummary } from "@/lib/domain/types";

export function GroupCreation({ client, groups, onCreated, onMfaRequired }: { client: SupabaseClient; groups: GroupSummary[]; onCreated: (group: GroupSummary) => void; onMfaRequired?: () => void }) {
  const [open, setOpen] = useState(false);
  const [age, setAge] = useState(6);
  const [suffix, setSuffix] = useState(() => nextGroupSuffix(groups, 6));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const pending = useRef<{ code: string; id: string } | null>(null);
  const saving = useRef(false);
  const code = ageGroupCode(age, suffix);
  const duplicate = groups.some((group) => (group.display_code ?? group.code) === code || group.code === code);

  function begin() {
    setSuffix(nextGroupSuffix(groups, age));
    setError(null);
    setSuccess(null);
    pending.current = null;
    setOpen(true);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!code || duplicate || saving.current) return;
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
      const result = await client.rpc("create_age_group", {
        p_age: age,
        p_team_suffix: suffix || null,
        p_request_id: pending.current.id,
      }).abortSignal(AbortSignal.timeout(20000)).single();
      if (result.error) throw result.error;
      const created = result.data as GroupSummary;
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
    <div className="section-title-row group-creation-toolbar"><div><h3>Групи клубу</h3><p className="muted">Створіть нову вікову групу, а потім призначте її новому або наявному тренеру.</p></div><button className="secondary-action" type="button" onClick={begin}><Plus size={18} />Додати групу</button></div>
    {success && <StatusMessage kind="success">{success}</StatusMessage>}
    {open && <Modal title="Додати групу" onClose={() => !saving.current && setOpen(false)} footer={<><button className="secondary-action" type="button" disabled={busy} onClick={() => setOpen(false)}>Скасувати</button><button className="primary-action" form="create-age-group" disabled={busy || !code || duplicate}>{busy ? "Створення…" : "Створити групу"}</button></>}>
      <form id="create-age-group" className="form-stack" onSubmit={create}>
        <label><span>Вікова категорія</span><select value={age} disabled={busy} onChange={(event) => { const nextAge = Number(event.target.value); setAge(nextAge); setSuffix(nextGroupSuffix(groups, nextAge)); setError(null); }}>{AGE_GROUP_VALUES.map((value) => <option key={value} value={value}>U{value}</option>)}</select></label>
        <label><span>Літера групи</span><select value={suffix} disabled={busy} onChange={(event) => { setSuffix(event.target.value); setError(null); }}>{age < 8 && <option value="">Без літери</option>}{GROUP_SUFFIX_VALUES.map((letter) => <option key={letter} value={letter}>{letter}</option>)}</select></label>
        <p className="group-creation-preview">Назва групи: <strong>{code ?? "Перевірте дані"}</strong></p>
        <p className="muted">Сезон і рік народження визначаються автоматично за поточним сезоном клубу. Групу можна створити без гравців та без призначеного тренера.</p>
        {duplicate && <StatusMessage kind="warning">Група {code} вже існує. Виберіть іншу літеру.</StatusMessage>}
        {error && <StatusMessage kind="error">{error}</StatusMessage>}
      </form>
    </Modal>}
  </>;
}
