import "server-only";
import { db, must } from "./db";
import type { StoredTasteProfile } from "./schemas";

/**
 * Feintuning der Person am KI-Profil:
 * - "confirm" (optional mit weight): Eintrag stimmt; weight überschreibt Gewicht bzw. Schwere.
 * - "reject": Eintrag ausblenden – wirkt sofort und die KI darf ihn nicht wieder einführen.
 * - "add": eigener Treiber bzw. eigene Abneigung (mit weight und optionaler Beschreibung).
 * Alles wirkt sofort auf Empfehlungen und Chat – ohne Neuberechnung – und bleibt beim Neuberechnen erhalten.
 */
export type Correction = {
  kind: "driver" | "aversion";
  mode_key: string | null;
  name: string;
  verdict: "confirm" | "reject" | "add";
  weight?: number | null;
  description?: string | null;
};

export const norm = (s: string) => s.trim().toLowerCase();
export const correctionKey = (kind: string, modeKey: string | null, name: string) => `${kind}|${modeKey ?? ""}|${norm(name)}`;

export async function loadCorrections(userId: string): Promise<Correction[]> {
  const { data } = await db().from("profile_corrections").select("kind, mode_key, name, verdict, weight, description").eq("user_id", userId);
  return (data ?? []) as Correction[];
}

async function deleteCorrection(userId: string, c: Pick<Correction, "kind" | "mode_key" | "name">) {
  const { data } = await db().from("profile_corrections").select("id, kind, mode_key, name").eq("user_id", userId).eq("kind", c.kind);
  const ids = ((data ?? []) as (Correction & { id: string })[])
    .filter((r) => (r.mode_key ?? null) === (c.mode_key ?? null) && norm(r.name) === norm(c.name))
    .map((r) => r.id);
  if (ids.length) must(await db().from("profile_corrections").delete().in("id", ids), "profile_corrections.delete");
}

export async function setCorrection(userId: string, c: Correction) {
  await deleteCorrection(userId, c);
  must(
    await db()
      .from("profile_corrections")
      .insert({ user_id: userId, kind: c.kind, mode_key: c.mode_key, name: c.name.trim(), verdict: c.verdict, weight: c.weight ?? null, description: c.description ?? null }),
    "profile_corrections.insert",
  );
}

/** Gewicht/Schwere setzen. Ein eigener Eintrag bleibt ein eigener Eintrag (nur das Gewicht ändert sich). */
export async function setWeight(userId: string, c: Pick<Correction, "kind" | "mode_key" | "name">, weight: number) {
  const existing = (await loadCorrections(userId)).find((x) => correctionKey(x.kind, x.mode_key, x.name) === correctionKey(c.kind, c.mode_key, c.name));
  if (existing?.verdict === "add") await setCorrection(userId, { ...existing, weight });
  else await setCorrection(userId, { ...c, verdict: "confirm", weight });
}

export async function removeCorrection(userId: string, c: Pick<Correction, "kind" | "mode_key" | "name">) {
  await deleteCorrection(userId, c);
}

const OWN_EVIDENCE = "Eigene Angabe";

/** Ausblenden, Gewichte überschreiben, eigene Einträge ergänzen (wirkt sofort auf Anzeige, Empfehlungen und Chat). */
export function applyCorrections(profile: StoredTasteProfile, corrections: Correction[]): StoredTasteProfile {
  if (!corrections.length) return profile;
  const rejected = new Set(corrections.filter((c) => c.verdict === "reject").map((c) => correctionKey(c.kind, c.mode_key, c.name)));
  const weights = new Map(corrections.filter((c) => c.weight != null && c.verdict !== "reject").map((c) => [correctionKey(c.kind, c.mode_key, c.name), c.weight!]));
  const own = corrections.filter((c) => c.verdict === "add");
  const ownFor = (kind: Correction["kind"], modeKey: string | null, present: { name: string }[]) =>
    own
      .filter((c) => c.kind === kind && (c.mode_key ?? null) === modeKey && !present.some((p) => norm(p.name) === norm(c.name)))
      .map((c) => ({ name: c.name, description: c.description ?? "", evidence: [OWN_EVIDENCE], own: true }));

  const drivers = (modeKey: string, list: StoredTasteProfile["modes"][number]["drivers"]) => {
    const kept = list
      .filter((d) => !rejected.has(correctionKey("driver", modeKey, d.name)))
      .map((d) => {
        const w = weights.get(correctionKey("driver", modeKey, d.name));
        return w != null ? { ...d, weight: w, tuned: true } : d;
      });
    return [...kept, ...ownFor("driver", modeKey, kept).map((d) => ({ ...d, weight: weights.get(correctionKey("driver", modeKey, d.name)) ?? 4 }))];
  };
  const aversions = (modeKey: string | null, list: StoredTasteProfile["global_aversions"]) => {
    const kept = list
      .filter((a) => !rejected.has(correctionKey("aversion", modeKey, a.name)))
      .map((a) => {
        const w = weights.get(correctionKey("aversion", modeKey, a.name));
        return w != null ? { ...a, severity: w, tuned: true } : a;
      });
    return [...kept, ...ownFor("aversion", modeKey, kept).map((a) => ({ ...a, severity: weights.get(correctionKey("aversion", modeKey, a.name)) ?? 4 }))];
  };

  return {
    ...profile,
    modes: profile.modes.map((m) => ({ ...m, drivers: drivers(m.key, m.drivers), aversions: aversions(m.key, m.aversions) })),
    global_aversions: aversions(null, profile.global_aversions),
  };
}

/** Für den Profil-Prompt: was die Person festgelegt hat. */
export function correctionsForPrompt(corrections: Correction[], modeName: (key: string | null) => string): string {
  if (!corrections.length) return "";
  const line = (c: Correction) =>
    `- ${c.kind === "driver" ? "Treiber" : "Abneigung"} "${c.name}" (${modeName(c.mode_key)})${c.weight != null ? ` – ${c.kind === "driver" ? "Gewicht" : "Schwere"} ${c.weight}/5` : ""}${c.description ? `: ${c.description}` : ""}`;
  const confirmed = corrections.filter((c) => c.verdict === "confirm");
  const added = corrections.filter((c) => c.verdict === "add");
  const rejected = corrections.filter((c) => c.verdict === "reject");
  return [
    "\n## Festlegungen der Person am Profil (VERBINDLICH)",
    confirmed.length ? "Bestätigt – beibehalten, mit genau diesem Gewicht:" : "",
    ...confirmed.map(line),
    added.length ? "Von der Person selbst ergänzt – werden automatisch übernommen, NICHT doppelt aufführen:" : "",
    ...added.map(line),
    rejected.length ? "Abgelehnt – NICHT wieder aufnehmen, auch nicht umformuliert:" : "",
    ...rejected.map(line),
  ]
    .filter(Boolean)
    .join("\n");
}
