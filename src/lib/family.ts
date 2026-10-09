import "server-only";
import { refreshMissingAssets } from "./assets";
import { db, must } from "./db";
import { ensureSteamGames } from "./importer";
import { HttpError } from "./session";
import { getOwnedGames, getPlayerSummary, resolveSteamId } from "./steam";
import type { UserRow } from "./types";

/**
 * Steam-Familie ohne Zwang zur Anmeldung: Mitglieder können ohne GameCompass-Konto angelegt werden.
 * Ihre Spiele kommen aus dem öffentlichen Steam-Profil, aus einer CSV-Datei oder werden einzeln eingetragen.
 */
export type FamilyMember = {
  id: string;
  group_id: string;
  name: string;
  steam_id: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
  game_count: number;
};

/** Steam-Familien-Gruppe der Person – wird bei Bedarf angelegt. */
export async function familyGroupId(user: UserRow, create = false): Promise<string | null> {
  const { data } = await db()
    .from("group_members")
    .select("group_id, groups!inner(is_steam_family, created_at)")
    .eq("user_id", user.id)
    .eq("groups.is_steam_family", true)
    .limit(1)
    .maybeSingle();
  if (data) return (data as { group_id: string }).group_id;
  if (!create) return null;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => alphabet[b % alphabet.length]).join("");
  const group = must(
    await db().from("groups").insert({ name: "Steam-Familie", is_steam_family: true, invite_code: code, created_by: user.id }).select("id").single(),
    "groups.family",
  ) as { id: string };
  must(await db().from("group_members").insert({ group_id: group.id, user_id: user.id }), "group_members.family");
  return group.id;
}

export async function listFamilyMembers(user: UserRow): Promise<FamilyMember[]> {
  const groupId = await familyGroupId(user);
  if (!groupId) return [];
  const rows = must(
    await db().from("family_members").select("id, group_id, name, steam_id, last_synced_at, sync_error, family_member_games(count)").eq("group_id", groupId).order("created_at"),
    "family_members.list",
  ) as (Omit<FamilyMember, "game_count"> & { family_member_games: { count: number }[] })[];
  return rows.map(({ family_member_games, ...m }) => ({ ...m, game_count: family_member_games[0]?.count ?? 0 }));
}

/** Nur Mitglieder der eigenen Familien-Gruppe dürfen bearbeitet werden. */
export async function memberOf(user: UserRow, memberId: string) {
  const groupId = await familyGroupId(user);
  const { data } = await db().from("family_members").select("id, group_id, name, steam_id").eq("id", memberId).maybeSingle();
  const m = data as { id: string; group_id: string; name: string; steam_id: string | null } | null;
  if (!m || m.group_id !== groupId) throw new HttpError(404, "Familienmitglied nicht gefunden");
  return m;
}

export async function addFamilyMember(user: UserRow, input: { name?: string; steam?: string }) {
  let steamId: string | null = null;
  let name = input.name?.trim() || "";
  if (input.steam?.trim()) {
    steamId = await resolveSteamId(input.steam);
    if (!steamId) throw new HttpError(400, "Steam-Profil nicht gefunden – Profil-Link, SteamID64 oder Profilname eintragen.");
    if (!name) name = (await getPlayerSummary(steamId))?.personaname ?? "";
  }
  if (!name) throw new HttpError(400, "Bitte einen Namen eintragen.");
  const groupId = await familyGroupId(user, true);
  const m = must(
    await db().from("family_members").insert({ group_id: groupId, name: name.slice(0, 60), steam_id: steamId, created_by: user.id }).select("id").single(),
    "family_members.insert",
  ) as { id: string };
  if (steamId) await syncFamilyMember(user, m.id).catch(() => undefined); // Fehler steht dann am Mitglied
  return m.id;
}

export async function removeFamilyMember(user: UserRow, memberId: string) {
  await memberOf(user, memberId);
  must(await db().from("family_members").delete().eq("id", memberId), "family_members.delete");
}

/** Spiele aus dem öffentlichen Steam-Profil laden (ersetzt die zuvor per Steam geladenen Spiele). */
export async function syncFamilyMember(user: UserRow, memberId: string) {
  const m = await memberOf(user, memberId);
  if (!m.steam_id) throw new HttpError(400, "Für dieses Mitglied ist kein Steam-Profil hinterlegt.");
  const owned = await getOwnedGames(m.steam_id);
  if (owned === null) {
    const msg = "Spieleliste ist privat. In Steam: Profil → Profil bearbeiten → Privatsphäre → „Spieldetails“ auf Öffentlich – oder CSV/manuell eintragen.";
    await db().from("family_members").update({ sync_error: msg }).eq("id", memberId);
    throw new HttpError(400, msg);
  }
  const ids = await ensureSteamGames(owned.filter((g) => g.name).map((g) => ({ appid: g.appid, title: g.name })));
  const gameIds = [...ids.values()];
  must(await db().from("family_member_games").delete().eq("member_id", memberId).eq("source", "steam"), "family_member_games.clear");
  for (let i = 0; i < gameIds.length; i += 500) {
    must(
      await db()
        .from("family_member_games")
        .upsert(gameIds.slice(i, i + 500).map((g) => ({ member_id: memberId, game_id: g, source: "steam" })), { onConflict: "member_id,game_id", ignoreDuplicates: true }),
      "family_member_games.insert",
    );
  }
  await db().from("family_members").update({ last_synced_at: new Date().toISOString(), sync_error: null }).eq("id", memberId);
  await refreshMissingAssets().catch((e) => console.warn("Assets", e)); // Bilder + Plattformen für neue Spiele
  await db().from("user_deals").delete().eq("user_id", user.id); // Familie hat sich geändert -> Deals neu berechnen
  return gameIds.length;
}

export async function addGamesToMember(user: UserRow, memberId: string, gameIds: string[], source: "csv" | "manual") {
  await memberOf(user, memberId);
  for (let i = 0; i < gameIds.length; i += 500) {
    must(
      await db()
        .from("family_member_games")
        .upsert(gameIds.slice(i, i + 500).map((g) => ({ member_id: memberId, game_id: g, source })), { onConflict: "member_id,game_id", ignoreDuplicates: true }),
      "family_member_games.add",
    );
  }
  await refreshMissingAssets().catch((e) => console.warn("Assets", e));
  await db().from("user_deals").delete().eq("user_id", user.id);
}

export async function removeGameFromMember(user: UserRow, memberId: string, gameId: string) {
  await memberOf(user, memberId);
  must(await db().from("family_member_games").delete().eq("member_id", memberId).eq("game_id", gameId), "family_member_games.remove");
}
