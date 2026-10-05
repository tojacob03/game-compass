/**
 * Spielmodi per gewichtetem, hierarchischem Clustering (Average Linkage) über ZENTRIERTE Essenz-Vektoren.
 *
 * Warum so:
 * - Zentrierung (Katalog-Durchschnitt abziehen): Alle Essenz-Texte teilen Aufbau und Vokabular, roh liegen
 *   alle Ähnlichkeiten bei 0.75–0.90. Zentriert bleibt nur das Unterscheidende übrig.
 * - Hierarchisch statt k-Means: robust bei wenigen Spielen, deterministisch, keine feste Modus-Anzahl.
 * - Gewichtet nach Engagement: Ein 400-h-Spiel prägt seinen Modus stärker als ein angespieltes.
 */

export type Point = { id: string; vector: number[]; weight: number };

/** Ab dieser (gewichteten) Durchschnitts-Ähnlichkeit gehören zwei Gruppen zum selben Modus. */
const MERGE_THRESHOLD = 0.12;
/** Mindest-Stärke (Summe der Engagement-Gewichte) eines Modus. */
const MIN_STRENGTH = 0.7;
const MAX_MODES = 5;

export const dot = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

export function normalize(v: number[]) {
  const n = Math.sqrt(dot(v, v)) || 1;
  return v.map((x) => x / n);
}

export function centerOn(mean: number[] | null) {
  return (v: number[]) => (mean ? normalize(v.map((x, i) => x - mean[i])) : v);
}

function linkage(a: Point[], b: Point[]) {
  let s = 0;
  let ws = 0;
  for (const p of a)
    for (const q of b) {
      s += dot(p.vector, q.vector) * p.weight * q.weight;
      ws += p.weight * q.weight;
    }
  return ws ? s / ws : -1;
}

const strength = (g: Point[]) => g.reduce((s, p) => s + p.weight, 0);

/** Liefert Modi als Listen von Punkt-IDs, stärkster Modus zuerst; innerhalb nach Gewicht sortiert. */
export function clusterModes(points: Point[]): string[][] {
  if (!points.length) return [];
  const groups = points.map((p) => [p]);
  for (;;) {
    let best = -Infinity;
    let bi = -1;
    let bj = -1;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const s = linkage(groups[i], groups[j]);
        if (s > best) {
          best = s;
          bi = i;
          bj = j;
        }
      }
    if (bi < 0 || best < MERGE_THRESHOLD) break;
    groups[bi] = [...groups[bi], ...groups[bj]];
    groups.splice(bj, 1);
  }

  // Echte Modi: genug Engagement – entweder mehrere Spiele oder ein einzelnes, das richtig gezogen hat
  const isMode = (g: Point[]) => strength(g) >= MIN_STRENGTH && (g.length >= 2 || g[0].weight >= 0.9);
  let modes = groups.filter(isMode).sort((a, b) => strength(b) - strength(a)).slice(0, MAX_MODES);
  if (!modes.length) modes = [points]; // zu wenig Signal: ein gemeinsamer Modus

  return modes.map((g) => [...g].sort((a, b) => b.weight - a.weight).map((p) => p.id));
}

export function groupCentroids(groups: string[][], points: Point[]): number[][] {
  const byId = new Map(points.map((p) => [p.id, p]));
  return groups.map((g) => {
    const dim = points[0].vector.length;
    const c = new Array(dim).fill(0);
    for (const id of g) {
      const p = byId.get(id)!;
      for (let i = 0; i < dim; i++) c[i] += p.vector[i] * p.weight;
    }
    return normalize(c);
  });
}

export function nearestGroup(vector: number[], centroids: number[][]): { index: number; similarity: number } {
  let index = 0;
  let similarity = -Infinity;
  centroids.forEach((c, i) => {
    const s = dot(vector, c);
    if (s > similarity) {
      similarity = s;
      index = i;
    }
  });
  return { index, similarity };
}
