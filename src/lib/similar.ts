import "server-only";
import { db } from "./db";
import { parsePgVector } from "./gemini";
import { loadLibrary } from "./taste";

export type SimilarOwn = { game_id: string; title: string; sim: number };

let meanCache: { at: number; mean: number[] | null } | null = null;
/** Katalog-Durchschnitt der Essenz-Vektoren (für Zentrierung), 10 Minuten gecacht. */
export async function catalogMean(): Promise<number[] | null> {
  if (meanCache && Date.now() - meanCache.at < 10 * 60 * 1000) return meanCache.mean;
  const { data } = await db().rpc("catalog_mean_embedding");
  meanCache = { at: Date.now(), mean: parsePgVector(data) };
  return meanCache.mean;
}

export function centerWith(mean: number[] | null) {
  return (v: number[]) => {
    if (!mean) return v;
    const c = v.map((x, i) => x - mean[i]);
    const n = Math.sqrt(c.reduce((s, x) => s + x * x, 0)) || 1;
    return c.map((x) => x / n);
  };
}

const dot = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/**
 * Für mehrere Spiele: die ähnlichsten Spiele aus der eigenen Bibliothek, die die Person wirklich gepackt haben
 * (Engagement ≥ "solide"). Zentriert verglichen – roh sind sich alle Essenzen zu ähnlich.
 */
export async function similarOwnGames(userId: string, targets: { id: string; vector: number[] }[], top = 2, minSim = 0.1): Promise<Map<string, SimilarOwn[]>> {
  const out = new Map<string, SimilarOwn[]>();
  if (!targets.length) return out;
  const [lib, mean] = await Promise.all([loadLibrary(userId), catalogMean()]);
  const center = centerWith(mean);
  const own = lib
    .filter((g) => g.vector && g.engagement && g.engagement.weight >= 0.45)
    .map((g) => ({ game_id: g.game_id, title: g.games.title, v: center(g.vector!) }));
  for (const t of targets) {
    const tv = center(t.vector);
    const ranked = own
      .filter((o) => o.game_id !== t.id)
      .map((o) => ({ game_id: o.game_id, title: o.title, sim: Math.round(dot(tv, o.v) * 100) / 100 }))
      .filter((o) => o.sim >= minSim)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, top);
    out.set(t.id, ranked);
  }
  return out;
}
