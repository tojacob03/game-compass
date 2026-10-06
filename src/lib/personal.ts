import "server-only";
import { dot } from "./cluster";
import { db } from "./db";
import { parsePgVector } from "./gemini";
import type { StoredTasteProfile } from "./schemas";
import { catalogMean, centerWith } from "./similar";
import { ensureFacetVectors, loadLibrary, type Facet } from "./taste";

/**
 * Persönliches Ranking aus fünf Signalen, alle auf ZENTRIERTEN Essenz-Vektoren (roh sind sich alle Spiele zu ähnlich):
 *
 * 1. Such-Facetten des Modus (inkl. Sofort-Lernen aus 👍/👎)
 * 2. Nachbarn: Wie nah ist ein Kandidat an Spielen, die dich wirklich gepackt haben? (wirkt sofort nach jeder Bewertung)
 * 3. Treiber mit DEINEN Gewichten (wirkt sofort, wenn du ein Gewicht änderst oder einen eigenen Treiber ergänzt)
 * 4. Abneigungen mit DEINER Schwere – Strafe nur bei deutlicher Nähe
 * 5. Anti-Nachbarn: Nähe zu Spielen, die nicht gezündet haben oder die du abgelehnt hast
 *
 * Jedes Signal wird über den Kandidaten-Pool standardisiert (z-Wert), damit die Gewichte vergleichbar sind.
 * Gewichte kalibriert per Leave-one-out auf echten Bibliotheken: Top-10-Trefferquote 21 % → 42 % gegenüber nur Facetten.
 */
const W = { intent: 1, like: 1, driver: 0.5, aversion: 0.4, dislike: 0.6, quality: 0.2 };

export type ScoringIntent = { weight: number; vector: number[]; mode_key: string | null };
export type Neighbor = { id: string; title: string; weight: number; vector: number[] };

type Features = { intent: number; like: number; driver: number; aversion: number; dislike: number; quality: number };

export type PersonalInput = {
  intents: ScoringIntent[];
  facets: Facet[];
  likes: Neighbor[];
  dislikes: Neighbor[];
  mean: number[] | null;
  /** null = Mix über alle Modi */
  modeKey: string | null;
};

export type Scored = { score: number; features: Features; dislikedNeighbors: { title: string; sim: number }[] };

export function personalScorer(input: PersonalInput) {
  const center = centerWith(input.mean);
  const intents = input.intents.filter((i) => i.vector.length).map((i) => ({ w: 0.8 + 0.05 * i.weight, v: center(i.vector) }));
  const inMode = (f: Facet) => !input.modeKey || f.mode_key === input.modeKey || f.mode_key === null;
  const drivers = input.facets.filter((f) => f.kind === "driver" && inMode(f) && f.vector.length).map((f) => ({ w: f.weight, v: center(f.vector) }));
  const aversions = input.facets.filter((f) => f.kind === "aversion" && inMode(f) && f.vector.length).map((f) => ({ w: f.weight, v: center(f.vector) }));
  const likes = input.likes.map((n) => ({ ...n, c: center(n.vector) }));
  const dislikes = input.dislikes.map((n) => ({ ...n, c: center(n.vector) }));

  function features(id: string, vector: number[], quality: number | null): Features & { dis: { title: string; sim: number }[] } {
    const c = center(vector);
    const top = (xs: number[], k: number) => {
      const s = [...xs].sort((a, b) => b - a).slice(0, k);
      return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
    };
    const near = likes
      .filter((n) => n.id !== id)
      .map((n) => ({ s: dot(c, n.c), w: n.weight }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);
    const dis = dislikes
      .filter((n) => n.id !== id)
      .map((n) => ({ title: n.title, sim: dot(c, n.c), w: Math.abs(n.weight) }))
      .sort((a, b) => b.sim * b.w - a.sim * a.w);
    return {
      intent: intents.length ? Math.max(...intents.map((i) => dot(c, i.v) * i.w)) : 0,
      like: near.reduce((s, x) => s + x.s * x.w, 0) / (near.reduce((s, x) => s + x.w, 0) || 1),
      // Treiber: Durchschnitt der drei bestpassenden, je stärker gewichtet desto mehr zählt die Nähe
      driver: top(drivers.map((d) => dot(c, d.v) * (0.6 + 0.1 * d.w)), 3),
      // Abneigung: die stärkste Nähe, skaliert mit der Schwere (5 = No-Go zählt voll)
      aversion: aversions.length ? Math.max(...aversions.map((a) => dot(c, a.v) * (a.w / 5))) : 0,
      dislike: dis.length ? dis[0].sim * dis[0].w : 0,
      quality: quality ?? 0.75,
      dis: dis.filter((d) => d.sim >= 0.15).slice(0, 2).map((d) => ({ title: d.title, sim: Math.round(d.sim * 100) / 100 })),
    };
  }

  /** Bewertet einen ganzen Pool; z-Werte relativ zu genau diesem Pool. */
  return function scorePool<T extends { id: string; vector: number[]; quality: number | null }>(pool: T[]): Map<string, Scored> {
    const raw = pool.map((p) => ({ p, f: features(p.id, p.vector, p.quality) }));
    const keys: (keyof Features)[] = ["intent", "like", "driver", "aversion", "dislike", "quality"];
    const stats = Object.fromEntries(
      keys.map((k) => {
        const xs = raw.map((r) => r.f[k]);
        const m = xs.reduce((s, x) => s + x, 0) / (xs.length || 1);
        const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length || 1));
        return [k, { m, sd: sd > 1e-6 ? sd : 1 }];
      }),
    ) as Record<keyof Features, { m: number; sd: number }>;
    const z = (f: Features, k: keyof Features) => (f[k] - stats[k].m) / stats[k].sd;
    const out = new Map<string, Scored>();
    for (const { p, f } of raw) {
      const score =
        W.intent * z(f, "intent") +
        W.like * z(f, "like") +
        W.driver * z(f, "driver") -
        W.aversion * Math.max(0, z(f, "aversion") - 0.5) -
        W.dislike * Math.max(0, z(f, "dislike") - 0.5) +
        W.quality * z(f, "quality");
      out.set(p.id, { score, features: f, dislikedNeighbors: f.dis });
    }
    return out;
  };
}

/**
 * Eigene Spiele als Nachbarn: gepackt (Engagement ≥ "solide") und nicht gezündet/abgelehnt –
 * plus Empfehlungen, die mit "Eher nicht" beantwortet wurden.
 */
export async function loadNeighbors(userId: string, opts: { excludeGameIds?: Set<string> } = {}) {
  const lib = await loadLibrary(userId, opts);
  const likes: Neighbor[] = [];
  const dislikes: Neighbor[] = [];
  for (const g of lib) {
    if (!g.vector || !g.engagement) continue;
    const n = { id: g.game_id, title: g.games.title, weight: g.engagement.weight, vector: g.vector };
    if (g.engagement.weight >= 0.45) likes.push(n);
    else if (g.engagement.weight < 0) dislikes.push(n);
  }
  const { data } = await db()
    .from("rec_feedback")
    .select("game_id, games!inner(title, essence_embedding)")
    .eq("user_id", userId)
    .eq("verdict", "not_interested")
    .not("games.essence_embedding", "is", null)
    .limit(100);
  for (const r of (data ?? []) as unknown as { game_id: string; games: { title: string; essence_embedding: unknown } }[]) {
    if (opts.excludeGameIds?.has(r.game_id)) continue;
    const v = parsePgVector(r.games.essence_embedding);
    if (v) dislikes.push({ id: r.game_id, title: r.games.title, weight: -0.6, vector: v });
  }
  return { likes, dislikes };
}

export async function buildPersonalScorer(userId: string, profile: StoredTasteProfile, intents: ScoringIntent[], modeKey: string | null) {
  const [facets, neighbors, mean] = await Promise.all([ensureFacetVectors(userId, profile), loadNeighbors(userId), catalogMean()]);
  return personalScorer({ intents, facets, ...neighbors, mean, modeKey });
}
