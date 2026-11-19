interface PrimaryPlayer { id: string; group_id: string; }
export interface ExtraMembership { player_id: string; group_id: string; active_from: string; active_to: string | null; }

function rosterMemberIds(players: PrimaryPlayer[], memberships: ExtraMembership[], day: string) {
  const active = new Set(players.map((player) => player.id));
  const pairs = new Map<string, Set<string>>();
  function add(groupId: string, playerId: string) {
    if (!pairs.has(groupId)) pairs.set(groupId, new Set());
    pairs.get(groupId)!.add(playerId);
  }
  for (const player of players) add(player.group_id, player.id);
  for (const member of memberships) if (active.has(member.player_id) && member.active_from <= day && (!member.active_to || day < member.active_to)) add(member.group_id, member.player_id);
  return pairs;
}

export function rosterCounts(players: PrimaryPlayer[], memberships: ExtraMembership[], day: string) {
  return Object.fromEntries([...rosterMemberIds(players, memberships, day)].map(([id, members]) => [id, members.size]));
}

interface RosterGroup { id: string; label: string; }

export interface GroupedRoster<T> {
  day: string;
  groups: Array<RosterGroup & { players: T[] }>;
  totalPlayers: number;
  totalMemberships: number;
}

export function groupedRoster<T extends PrimaryPlayer & { full_name: string }>(
  groups: RosterGroup[], players: T[], memberships: ExtraMembership[], day: string,
): GroupedRoster<T> {
  const memberIds = rosterMemberIds(players, memberships, day);
  const playersById = new Map(players.map((player) => [player.id, player]));
  const included = new Set<string>();
  let totalMemberships = 0;
  const grouped = groups.map((group) => {
    const roster = [...(memberIds.get(group.id) ?? [])].map((id) => {
      included.add(id);
      return playersById.get(id)!;
    }).sort((left, right) => left.full_name.localeCompare(right.full_name, "uk-UA") || left.id.localeCompare(right.id));
    totalMemberships += roster.length;
    return { ...group, players: roster };
  });
  return { day, groups: grouped, totalPlayers: included.size, totalMemberships };
}

export function membershipError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "40001") return "Склад уже змінився. Оновіть профіль і повторіть дію.";
  if (code === "42501") return "Потрібен доступ адміністратора з двоетапним підтвердженням.";
  return "Участь у воротарській групі не збережено. Оновіть дані та повторіть спробу.";
}
