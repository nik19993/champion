"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingState, Modal, SearchField, StatusMessage } from "@/components/common/workspace-ui";
import { membershipError } from "@/lib/domain/group-memberships";
import { groupCode } from "@/lib/domain/seasons";
import type { GroupSummary, Player, Profile } from "@/lib/domain/types";
import type { MembershipLabel } from "@/lib/supabase/group-roster";

export function PlayerMemberships({ client, player, profile, groups, onSaved }: { client: SupabaseClient; player: Player; profile?: Profile; groups: GroupSummary[]; onSaved?: () => void }) {
  const [labels, setLabels] = useState<MembershipLabel[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.rpc("player_group_labels", { p_player_id: player.id });
      if (result.error) throw result.error;
      const rows = (result.data ?? []) as MembershipLabel[];
      setLabels(rows);
      setSelected(rows.find((row) => !row.is_primary)?.group_id ?? "");
    } catch (error) { setLabels([]); setMessage(membershipError(error)); }
    finally { setLoading(false); }
  }, [client, player.id]);
  useEffect(() => { void load(); }, [load]);
  const current = labels.find((row) => !row.is_primary)?.group_id ?? "";
  const canSave = profile?.role === "admin" && player.is_active && !loading && !busy && labels.some((row) => row.is_primary);
  async function save() {
    if (!canSave || selected === current) return;
    setBusy(true); setMessage(null);
    try {
      const result = await client.rpc("set_player_goalkeeper_group", { p_player_id: player.id, p_group_id: selected || null, p_expected_group_id: current || null });
      if (result.error) throw result.error;
      await load();
      onSaved?.();
    } catch (error) { setMessage(membershipError(error)); }
    finally { setBusy(false); }
  }
  return <section className="profile-section"><h3>Групи гравця</h3>{loading ? <LoadingState /> : <>
    <p><b>Основна вікова група:</b> {labels.find((row) => row.is_primary)?.code ?? groupCode(player.groups)}</p>
    <p><b>Воротарська група:</b> {labels.find((row) => !row.is_primary)?.code ?? "Не призначено"}</p>
    {profile?.role === "admin" && player.is_active && <div className="form-stack"><label><span>Додаткова воротарська група</span><select disabled={!canSave} value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Не призначено</option>{groups.filter((group) => group.group_kind === "goalkeeper").map((group) => <option key={group.id} value={group.id}>{groupCode(group)}</option>)}</select></label><button className="secondary-action" type="button" disabled={!canSave || selected === current} onClick={() => void save()}>{busy ? "Збереження…" : "Зберегти воротарську групу"}</button></div>}
    <p className="muted">Один профіль, спільні особисті дані та окреме відвідування занять кожної групи.</p>
  </>}{message && <StatusMessage kind="error">{message}</StatusMessage>}</section>;
}

interface Candidate { id: string; full_name: string; birth_date: string | null; birth_year: number | null; groups?: {code:string;display_code?:string|null}|null; }

export function EnrollGoalkeeper({ client, group, onSaved }: { client: SupabaseClient; group: GroupSummary; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const candidates = useMemo(() => players.filter((player) => player.full_name.toLocaleLowerCase("uk").includes(search.trim().toLocaleLowerCase("uk"))), [players, search]);
  async function begin() {
    setOpen(true); setLoading(true); setError(null); setPlayerId(""); setSearch("");
    try {
      const [rows, memberships] = await Promise.all([
        client.from("players").select("id,full_name,birth_date,birth_year,groups(code,display_code)").eq("is_active",true).order("full_name").limit(5000),
        client.from("player_group_memberships").select("player_id").is("active_to",null).limit(5000),
      ]);
      if (rows.error || memberships.error) throw rows.error ?? memberships.error;
      const assigned = new Set((memberships.data ?? []).map((row) => row.player_id));
      setPlayers(((rows.data ?? []) as unknown as Candidate[]).filter((row) => !assigned.has(row.id)));
    } catch (caught) { setError(membershipError(caught)); }
    finally { setLoading(false); }
  }
  async function save() {
    if (!playerId || busy || loading || error) return;
    setBusy(true);
    try {
      const result = await client.rpc("set_player_goalkeeper_group", { p_player_id: playerId, p_group_id: group.id, p_expected_group_id: null });
      if (result.error) throw result.error;
      setOpen(false); onSaved();
    } catch (caught) { setError(membershipError(caught)); }
    finally { setBusy(false); }
  }
  return <><button className="secondary-action" type="button" onClick={() => void begin()}>Додати наявного гравця</button>{open && <Modal title={`Додати до ${groupCode(group)}`} onClose={() => !busy && setOpen(false)} footer={<><button className="secondary-action" disabled={busy} onClick={() => setOpen(false)}>Скасувати</button><button className="primary-action" disabled={busy || loading || !playerId || Boolean(error)} onClick={() => void save()}>{busy ? "Збереження…" : "Додати до групи"}</button></>}>
    <p>Виберіть гравця вікової команди. Його основна група та профіль зберігаються.</p>
    {loading ? <LoadingState /> : <div className="form-stack"><SearchField value={search} onChange={setSearch} placeholder="Прізвище або ім’я" /><label><span>Гравець</span><select value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Виберіть гравця</option>{candidates.map((player) => <option key={player.id} value={player.id}>{player.full_name} · {player.birth_date?.slice(0,4) ?? player.birth_year ?? "—"} · {groupCode(player.groups)}</option>)}</select></label><p className="muted">Показано гравців без воротарської групи. Змінити вже призначену групу можна у профілі гравця.</p></div>}
    {error && <StatusMessage kind="error">{error}</StatusMessage>}
  </Modal>}</>;
}
