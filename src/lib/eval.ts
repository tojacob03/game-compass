import "server-only";
import { db, must } from "./db";
import { embed, parsePgVector } from "./gemini";
import { loadNeighbors, personalScorer } from "./personal";
import { catalogMean } from "./similar";
import { scoreCandidate, wilson, type Intent } from "./recommend";
import { HttpError } from "./session";
import { buildModeInput, embedIntents, facetsOf, generateTasteProfile } from "./taste";
import type { UserRow } from "./types";
import { consumeAi } from "./usage";

/**
 * Hold-out-Test: Wir verstecken einige Lieblingsspiele (Score >= 8), bauen das Profil OHNE sie neu
 * und prüfen, wie weit oben sie in einem Pool aus fremden Spielen landen.
 * Vergleich: unser Essenz-Ansatz vs. klassisches Tag-Matching vs. reine Beliebtheit.
 */
export async function evaluateHoldout(user: UserRow) {
  const rated = must(
    await db()
      .from("user_games")
      .select("game_id, score, games!inner(id, title, tags, essence_embedding)")
      .eq("user_id", user.id)
      .not("score", "is", null),
    "eval.rated",
  ) as unknown as { game_id: string; score: number; games: { id: string; title: string; tags: string[]; essence_embedding: unknown } }[];

  const favorites = rated.filter((r) => r.score >= 8 && r.games.essence_embedding);
  if (favorites.length < 4) {
    throw new HttpError(400, "Für den Test brauchst du mindestens 4 analysierte Spiele mit Bewertung ≥ 8.");
  }
  const shuffled = [...favorites].sort(() => Math.random() - 0.5);
  const holdout = shuffled.slice(0, Math.max(2, Math.min(6, Math.round(favorites.length * 0.3))));
  const holdoutIds = new Set(holdout.map((h) => h.game_id));

  await consumeAi(user.id, 2);
  const input = await buildModeInput(user.id, { excludeGameIds: holdoutIds });
  const profile = await generateTasteProfile(input, user.about_me);
  const intents: Intent[] = (await embedIntents(profile)).map((i) => ({ label: i.label, weight: i.weight, vector: i.vector, mode_key: i.mode_key }));

  // Pool: fremde, analysierte Spiele + die versteckten Favoriten
  const { data: knownRows } = await db().from("user_games").select("game_id").eq("user_id", user.id);
  const known = new Set(((knownRows ?? []) as { game_id: string }[]).map((r) => r.game_id));
  const others = must(
    await db()
      .from("games")
      .select("id, title, tags, review_positive, review_negative, essence_embedding")
      .not("essence_embedding", "is", null)
      .limit(600),
    "eval.pool",
  ) as { id: string; title: string; tags: string[]; review_positive: number | null; review_negative: number | null; essence_embedding: unknown }[];
  const holdoutGames = must(
    await db()
      .from("games")
      .select("id, title, tags, review_positive, review_negative, essence_embedding")
      .in("id", [...holdoutIds]),
    "eval.holdout",
  ) as typeof others;
  const pool = [...others.filter((g) => !known.has(g.id)), ...holdoutGames];
  const distractors = pool.length - holdout.length;
  if (distractors < 20) {
    throw new HttpError(400, `Der Katalog ist noch zu klein (${distractors} fremde Spiele). Generiere erst ein paar Empfehlungen.`);
  }

  // Baseline "Tags": gewichtete Tag-Häufigkeit der übrigen gut bewerteten Spiele (Content-based wie Steam "ähnliche Spiele")
  const tagWeights = new Map<string, number>();
  for (const r of rated.filter((r) => !holdoutIds.has(r.game_id) && r.score >= 7)) {
    r.games.tags.slice(0, 15).forEach((t, i) => tagWeights.set(t, (tagWeights.get(t) ?? 0) + (r.score - 5) * (1 - i / 20)));
  }
  const tagNorm = Math.sqrt([...tagWeights.values()].reduce((s, w) => s + w * w, 0)) || 1;
  const tagScore = (tags: string[]) => {
    const t = tags.slice(0, 15);
    const dot = t.reduce((s, tag, i) => s + (tagWeights.get(tag) ?? 0) * (1 - i / 20), 0);
    return dot / tagNorm / Math.sqrt(t.length || 1);
  };

  // Aktuelles Ranking: Facetten + eigene Spiele (ohne die versteckten!) + Treiber/Abneigungen
  const facetList = facetsOf(profile);
  const facetVectors = facetList.length ? await embed(facetList.map((f) => f.text)) : [];
  const [neighbors, mean] = await Promise.all([loadNeighbors(user.id, { excludeGameIds: holdoutIds }), catalogMean()]);
  const personal = personalScorer({
    intents,
    facets: facetList.map((f, i) => ({ ...f, vector: facetVectors[i] })),
    ...neighbors,
    mean,
    modeKey: null,
  })(pool.map((g) => ({ id: g.id, vector: parsePgVector(g.essence_embedding)!, quality: wilson(g.review_positive, g.review_negative) })));

  const methods = {
    personal: (g: (typeof pool)[number]) => personal.get(g.id)!.score,
    essence: (g: (typeof pool)[number]) =>
      scoreCandidate(parsePgVector(g.essence_embedding)!, intents, wilson(g.review_positive, g.review_negative)).score,
    tags: (g: (typeof pool)[number]) => tagScore(g.tags),
    popularity: (g: (typeof pool)[number]) => wilson(g.review_positive, g.review_negative) ?? 0,
  };

  const results = Object.entries(methods).map(([name, fn]) => {
    const ranked = pool.map((g) => ({ id: g.id, s: fn(g) })).sort((a, b) => b.s - a.s);
    const ranks = holdout.map((h) => ranked.findIndex((r) => r.id === h.game_id) + 1);
    const n = ranked.length;
    return {
      method: name,
      recallAt10: ranks.filter((r) => r <= 10).length / ranks.length,
      recallAt25: ranks.filter((r) => r <= 25).length / ranks.length,
      mrr: ranks.reduce((s, r) => s + 1 / r, 0) / ranks.length,
      meanPercentile: ranks.reduce((s, r) => s + (1 - (r - 1) / n), 0) / ranks.length,
      ranks,
    };
  });

  return {
    poolSize: pool.length,
    holdout: holdout.map((h) => h.games.title),
    results,
  };
}
