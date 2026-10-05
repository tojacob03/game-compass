import "server-only";
import { db, must } from "./db";
import { getAssets } from "./steam";

/** Bild-URLs für Spiele nachladen, die noch keine geprüften Assets haben (ohne KI-Kosten). */
export async function refreshAssets(appids: number[]) {
  const unique = [...new Set(appids)].filter(Boolean);
  if (!unique.length) return 0;
  const assets = await getAssets(unique);
  for (let i = 0; i < assets.length; i += 200) {
    must(await db().rpc("set_game_assets", { p: assets.slice(i, i + 200) }), "set_game_assets");
  }
  return assets.length;
}

/** Alle Spiele (oder eine Auswahl), deren Assets noch nie geprüft wurden. */
export async function refreshMissingAssets(gameIds?: string[]) {
  let q = db().from("games").select("steam_appid").not("steam_appid", "is", null).is("assets_fetched_at", null).limit(1000);
  if (gameIds?.length) q = q.in("id", gameIds.slice(0, 150));
  const { data } = await q;
  return refreshAssets(((data ?? []) as { steam_appid: number }[]).map((g) => g.steam_appid));
}
