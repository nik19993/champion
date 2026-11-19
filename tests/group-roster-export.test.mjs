import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { groupedRoster, rosterCounts } from "../lib/domain/group-memberships.ts";
import { loadActiveRosterMemberships, loadActiveRosterPlayers } from "../lib/supabase/group-roster.ts";

test("the group report lists current memberships and counts each active player once overall", () => {
  const day = "2026-11-09";
  const groups = [
    { id: "u10a", label: "U10A" },
    { id: "u10b", label: "U10B" },
    { id: "empty", label: "U11B" },
    { id: "keeper", label: "Воротарі B" },
  ];
  const players = [
    { id: "p2", group_id: "u10a", full_name: "Ярема Данило" },
    { id: "p1", group_id: "u10a", full_name: "Бойко Данило" },
    { id: "p3", group_id: "u10b", full_name: "Бойко Данило" },
    { id: "p4", group_id: "archived", full_name: "Гравець іншої групи" },
  ];
  const member = (player_id, group_id, active_from = day, active_to = null) => ({ player_id, group_id, active_from, active_to });
  const memberships = [
    member("p1", "keeper"),
    member("p1", "u10a"), // The same player/group pair appears as both primary and additional.
    member("p2", "keeper", "2026-09-01", day),
    member("p3", "empty", "2026-11-10"),
    member("inactive", "empty"),
  ];

  const result = groupedRoster(groups, players, memberships, day);
  assert.deepEqual(result.groups.map((group) => [group.id, group.players.map((player) => player.id)]), [
    ["u10a", ["p1", "p2"]], ["u10b", ["p3"]], ["empty", []], ["keeper", ["p1"]],
  ]);
  assert.equal(result.totalPlayers, 3);
  assert.equal(result.totalMemberships, 4);
  const counts = rosterCounts(players, memberships, day);
  for (const group of result.groups) assert.equal(group.players.length, counts[group.id] ?? 0);
});

function fixtureClient(fetch) {
  return createClient("https://roster-fixture.example", "local-fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
}

function rowsResponse(rows, offset, count) {
  return new Response(JSON.stringify(rows), { headers: {
    "Content-Type": "application/json",
    "Content-Range": rows.length ? `${offset}-${offset + rows.length - 1}/${count}` : `*/${count}`,
  } });
}

test("the export reads past a server page size smaller than requested", async () => {
  const players = ["p1", "p2", "p3", "p4", "p5"].map((id) => ({ id }));
  const offsets = [];
  const client = fixtureClient(async (input) => {
    const { pathname, searchParams } = new URL(input);
    assert.equal(pathname, "/rest/v1/players");
    assert.equal(searchParams.get("is_active"), "eq.true");
    const offset = Number(searchParams.get("offset"));
    offsets.push(offset);
    return rowsResponse(players.slice(offset, offset + 2), offset, players.length);
  });
  assert.deepEqual(await loadActiveRosterPlayers(client, "id"), players);
  assert.deepEqual(offsets, [0, 2, 4]);
});

test("the export refuses a membership result that changes during pagination", async () => {
  const day = "2026-11-09";
  const client = fixtureClient(async (input) => {
    const { pathname, searchParams } = new URL(input);
    assert.equal(pathname, "/rest/v1/player_group_memberships");
    assert.equal(searchParams.get("active_from"), `lte.${day}`);
    assert.equal(searchParams.get("or"), `(active_to.is.null,active_to.gt.${day})`);
    const offset = Number(searchParams.get("offset"));
    return offset ? rowsResponse([{ id: "m2" }], offset, 3) : rowsResponse([{ id: "m1" }], offset, 2);
  });
  await assert.rejects(loadActiveRosterMemberships(client, ["keeper"], day), /Склад груп змінився/);
});
