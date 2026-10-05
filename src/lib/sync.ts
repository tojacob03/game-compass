import "server-only";
import { db, must } from "./db";
import { enqueueAnalysis } from "./games";
import { HttpError } from "./session";
import { getAppNames, getOwnedGames, getWishlist } from "./steam";
import type { UserRow } from "./types";

/** Wie viele meistgespielte Spiele automatisch analysiert werden (Free-Tier-schonend). */
const AUTO_ANALYZE_TOP_PLAYED = 40;

export async function syncSteam(user: UserRow) {
  const owned = await getOwnedGames(user.steam_id);
  if (owned === null) {
    throw new HttpError(
      400,
      "Deine Steam-Spieldetails sind privat. Stelle unter Steam → Profil → Privatsphäre 'Spieldetails' auf Öffentlich.",
    );
  }
  const wishlist = await getWishlist(user.steam_id).catch(() => []);
  const wishNames = await getAppNames(wishlist.map((w) => w.appid));

  must(
    await db().rpc("sync_steam_library", {
      p_user: user.id,
      p_owned: owned.map((g) => ({
        appid: g.appid,
        name: g.name,
        playtime: g.playtime_forever,
        last_played: g.rtime_last_played ?? 0,
      })),
      p_wishlist: wishlist.map((w) => ({ appid: w.appid, name: wishNames.get(w.appid) ?? "" })),
    }),
    "sync_steam_library",
  );

  // Meistgespielte Spiele + Wunschliste für die KI-Analyse einreihen
  const topPlayed = [...owned]
    .filter((g) => g.playtime_forever >= 60)
    .sort((a, b) => b.playtime_forever - a.playtime_forever)
    .slice(0, AUTO_ANALYZE_TOP_PLAYED)
    .map((g) => g.appid);
  const appids = [...new Set([...topPlayed, ...wishlist.map((w) => w.appid)])];
  if (appids.length) {
    const games = must(
      await db().from("games").select("id, steam_appid, analyzed_at").in("steam_appid", appids),
      "games.select",
    ) as { id: string; steam_appid: number; analyzed_at: string | null }[];
    const rank = new Map(appids.map((a, i) => [a, i]));
    const pending = games.filter((g) => !g.analyzed_at).sort((a, b) => rank.get(a.steam_appid)! - rank.get(b.steam_appid)!);
    // Meistgespielte zuerst (absteigende Priorität 50..1)
    await enqueueAnalysis(
      user.id,
      pending.map((g, i) => ({ gameId: g.id, priority: 50 - Math.min(i, 49) })),
    );
  }

  await db().from("taste_profiles").update({ stale: true }).eq("user_id", user.id);
  return { owned: owned.length, wishlist: wishlist.length };
}
