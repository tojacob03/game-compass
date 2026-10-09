import "server-only";
import { db, fetchAll, must } from "./db";
import { normalizeTitle } from "./steam";

/** Offizielle, öffentliche Liste der GeForce-NOW-Spiele (NVIDIA). */
const GFN_URL = "https://static.nvidiagrid.net/supported-public-game-list/locales/gfnpc-en-US.json";
const TTL = 24 * 60 * 60 * 1000;

type GfnEntry = { id: number; title: string; steamUrl?: string; store?: string; status?: string };

/**
 * Einmal täglich: NVIDIA-Liste laden und allen Spielen ihre GFN-Verfügbarkeit zuordnen –
 * per Steam-AppID, sonst per Titel (Spiele, die bei GFN nur über Epic/Ubisoft laufen).
 */
export async function ensureGfnFresh(force = false): Promise<void> {
  if (!force) {
    const { data } = await db().from("gfn_games").select("fetched_at").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (data && Date.now() - Date.parse((data as { fetched_at: string }).fetched_at) < TTL) return;
  }
  const res = await fetch(GFN_URL, { signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!res.ok) throw new Error(`GeForce-NOW-Liste ${res.status}`);
  const list = ((await res.json()) as GfnEntry[] | null) ?? [];
  if (list.length < 100) throw new Error("GeForce-NOW-Liste unerwartet leer");

  const now = new Date().toISOString();
  const rows = list.map((e) => ({
    id: e.id,
    title: e.title,
    title_norm: normalizeTitle(e.title),
    steam_appid: Number(/\/app\/(\d+)/.exec(e.steamUrl ?? "")?.[1]) || null,
    store: e.store || null,
    status: e.status ?? null,
    fetched_at: now,
  }));
  for (let i = 0; i < rows.length; i += 500) must(await db().from("gfn_games").upsert(rows.slice(i, i + 500)), "gfn_games.upsert");
  await db().from("gfn_games").delete().lt("fetched_at", now); // nicht mehr gelistete Spiele

  const bySteam = new Map(rows.filter((r) => r.steam_appid).map((r) => [r.steam_appid!, r.store ?? "Steam"]));
  const byTitle = new Map(rows.map((r) => [r.title_norm, r.store ?? "?"]));
  const games = await fetchAll<{ id: string; steam_appid: number | null; title: string; gfn_store: string | null }>(
    (from, to) => db().from("games").select("id, steam_appid, title, gfn_store").order("id").range(from, to),
    "gfn.games",
  );
  const changed = games
    .map((g) => ({ id: g.id, before: g.gfn_store, store: (g.steam_appid && bySteam.get(g.steam_appid)) || byTitle.get(normalizeTitle(g.title)) || null }))
    .filter((g) => g.store !== g.before)
    .map((g) => ({ id: g.id, store: g.store ?? "" }));
  for (let i = 0; i < changed.length; i += 500) must(await db().rpc("set_gfn", { p: changed.slice(i, i + 500) }), "set_gfn");
}
