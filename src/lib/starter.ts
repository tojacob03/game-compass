import "server-only";
import { refreshMissingAssets } from "./assets";
import { dot } from "./cluster";
import { db, fetchAll, must } from "./db";
import { enqueueAnalysis } from "./games";
import { parsePgVector } from "./gemini";
import { ensureSteamGames } from "./importer";
import { catalogMean, centerWith } from "./similar";
import { markProfileStale } from "./taste";
import { VERDICT_SCORE, type RatingVerdict } from "./verdicts";

/**
 * Starter-Runde für Leute mit wenig oder keinen Steam-Spielen: bekannte Spiele bewerten, die man von
 * irgendwoher kennt (Konsole, Freunde, früher). Ausgewählt wird möglichst UNTERSCHIEDLICH, damit jede
 * Antwort viel über den Geschmack verrät (Farthest-Point-Auswahl auf den Essenz-Vektoren).
 */
export const STARTER_TARGET = 12; // ab so vielen Signalen ist die Starter-Runde nicht mehr nötig

export type StarterCard = { gameId: string; title: string; image: string | null; header: string | null; year: number | null; blurb: string | null };

/** Wie viele verwertbare Signale (bewertet oder ≥ 1 h gespielt) hat die Person? */
export async function signalCount(userId: string): Promise<number> {
  const { count } = await db()
    .from("user_games")
    .select("game_id, games!inner(is_software)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("games.is_software", false)
    .or("score.not.is.null,playtime_minutes.gte.60");
  return count ?? 0;
}

let topCache: { at: number; items: { appid: number; name: string; positive: number }[] } | null = null;
/** Meistgespielte Steam-Spiele (SteamSpy, kostenlos) – damit auch ohne großen Katalog Bekanntes dabei ist. */
async function steamTop(): Promise<{ appid: number; name: string; positive: number }[]> {
  if (topCache && Date.now() - topCache.at < 6 * 60 * 60 * 1000) return topCache.items;
  const items: { appid: number; name: string; positive: number }[] = [];
  for (const req of ["top100forever", "top100in2weeks"]) {
    try {
      const res = await fetch(`https://steamspy.com/api.php?request=${req}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
      if (!res.ok) continue;
      for (const g of Object.values((await res.json()) as Record<string, { appid: number; name: string; positive: number }>)) items.push(g);
    } catch {
      /* SteamSpy nicht erreichbar – dann nur der eigene Katalog */
    }
  }
  topCache = { at: Date.now(), items: [...new Map(items.map((i) => [i.appid, i])).values()] };
  return topCache.items;
}

export async function starterBatch(userId: string, n = 12): Promise<StarterCard[]> {
  const seen = new Set(
    (await fetchAll<{ game_id: string }>((from, to) => db().from("user_games").select("game_id").eq("user_id", userId).order("game_id").range(from, to), "starter.seen")).map(
      (r) => r.game_id,
    ),
  );

  // Bekannte, analysierte Spiele aus dem Katalog (viele Reviews = viele kennen es)
  type Row = { id: string; title: string; essence_embedding: unknown; review_positive: number | null; review_negative: number | null };
  const analyzed = (
    await fetchAll<Row>(
      (from, to) =>
        db()
          .from("games")
          .select("id, title, essence_embedding, review_positive, review_negative")
          .not("essence_embedding", "is", null)
          .eq("is_software", false)
          .gte("review_positive", 3000)
          .order("id")
          .range(from, to),
      "starter.pool",
    )
  ).filter((g) => !seen.has(g.id));

  // Farthest-Point: mit dem bekanntesten beginnen, dann immer das Spiel, das den bisher gewählten am UNähnlichsten ist
  const center = centerWith(await catalogMean());
  const pool = analyzed
    .map((g) => ({ id: g.id, pop: (g.review_positive ?? 0) + (g.review_negative ?? 0), v: center(parsePgVector(g.essence_embedding)!) }))
    .sort((a, b) => b.pop - a.pop)
    .slice(0, 150);
  const chosen: typeof pool = [];
  if (pool.length) chosen.push(pool.shift()!);
  while (chosen.length < Math.ceil(n * 0.75) && pool.length) {
    let best = 0;
    let bestScore = -Infinity;
    pool.forEach((p, i) => {
      const nearest = Math.max(...chosen.map((c) => dot(p.v, c.v)));
      // Unähnlichkeit zählt am meisten, Bekanntheit verhindert skurrile Ausreißer
      const score = -nearest + 0.1 * Math.log10(p.pop + 1);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    chosen.push(pool.splice(best, 1)[0]);
  }
  const ids = chosen.map((c) => c.id);

  // Auffüllen mit meistgespielten Steam-Spielen (auch noch nicht analysierte)
  if (ids.length < n) {
    // Software (z. B. Wallpaper Engine) hat hier noch keine Tags – daher per Name aussortieren
    const notGame = /wallpaper engine|soundpad|benchmark|rpg maker|vtube studio|aseprite|blender/i;
    const top = (await steamTop()).filter((t) => !notGame.test(t.name)).sort((a, b) => b.positive - a.positive);
    const map = await ensureSteamGames(top.slice(0, 200).map((t) => ({ appid: t.appid, title: t.name })));
    const extra = top.map((t) => map.get(t.appid)).filter((id): id is string => !!id && !seen.has(id) && !ids.includes(id));
    // nicht immer dieselben: aus den ersten 60 zufällig ziehen
    const shuffled = extra.slice(0, 60).sort(() => Math.random() - 0.5);
    ids.push(...shuffled.slice(0, n - ids.length));
  }
  if (!ids.length) return [];

  await refreshMissingAssets(ids).catch(() => undefined);
  const games = must(
    await db().from("games").select("id, title, capsule_image, header_image, release_year, short_description, is_software").in("id", ids),
    "starter.games",
  ) as { id: string; title: string; capsule_image: string | null; header_image: string | null; release_year: number | null; short_description: string | null; is_software: boolean }[];
  const byId = new Map(games.map((g) => [g.id, g]));
  return ids
    .map((id) => byId.get(id))
    .filter((g): g is NonNullable<typeof g> => !!g && !g.is_software)
    .map((g) => ({
      gameId: g.id,
      title: g.title,
      image: g.capsule_image,
      header: g.header_image,
      year: g.release_year,
      blurb: g.short_description ? g.short_description.slice(0, 140) : null,
    }));
}

/** Eigenes Lieblingsspiel per Steam-Suche als Karte holen (legt das Spiel bei Bedarf an). */
export async function starterCardFor(appid: number, title: string): Promise<StarterCard | null> {
  const ids = await ensureSteamGames([{ appid, title }]);
  const id = ids.get(appid);
  if (!id) return null;
  await refreshMissingAssets([id]).catch(() => undefined);
  const { data } = await db().from("games").select("id, title, capsule_image, header_image, release_year, short_description").eq("id", id).maybeSingle();
  const g = data as { id: string; title: string; capsule_image: string | null; header_image: string | null; release_year: number | null; short_description: string | null } | null;
  return g ? { gameId: g.id, title: g.title, image: g.capsule_image, header: g.header_image, year: g.release_year, blurb: g.short_description?.slice(0, 140) ?? null } : null;
}

/** Urteil zu einem Spiel, das man nicht (auf Steam) besitzt. "skip" = kenne ich nicht. */
export async function saveStarterRating(userId: string, gameId: string, verdict: RatingVerdict | "skip") {
  const now = new Date().toISOString();
  const { data: existing } = await db().from("user_games").select("game_id").eq("user_id", userId).eq("game_id", gameId).maybeSingle();
  const patch =
    verdict === "skip"
      ? { rate_skipped_at: now }
      : { score: VERDICT_SCORE[verdict], rated_at: now, rate_skipped_at: null };
  if (existing) {
    must(await db().from("user_games").update({ ...patch, updated_at: now }).eq("user_id", userId).eq("game_id", gameId), "starter.update");
  } else {
    must(await db().from("user_games").insert({ user_id: userId, game_id: gameId, ...patch, updated_at: now }), "starter.insert");
  }
  if (verdict === "skip") return;
  await markProfileStale(userId);
  const { data: g } = await db().from("games").select("analyzed_at").eq("id", gameId).maybeSingle();
  if (g && !(g as { analyzed_at: string | null }).analyzed_at) await enqueueAnalysis(userId, [{ gameId, priority: 90 }]);
}
