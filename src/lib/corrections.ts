import "server-only";
import { db, must } from "./db";
import type { StoredTasteProfile } from "./schemas";

/**
 * Korrekturen der Person am KI-Profil. "reject" blendet einen Treiber/eine Abneigung sofort aus und
 * verhindert, dass die KI ihn beim nächsten Neuberechnen wieder einführt. "confirm" schützt ihn davor,
 * beim Neuberechnen verloren zu gehen.
 */
export type Correction = { kind: "driver" | "aversion"; mode_key: string | null; name: string; verdict: "confirm" | "reject" };

export const norm = (s: string) => s.trim().toLowerCase();
export const correctionKey = (kind: string, modeKey: string | null, name: string) => `${kind}|${modeKey ?? ""}|${norm(name)}`;

export async function loadCorrections(userId: string): Promise<Correction[]> {
  const { data } = await db().from("profile_corrections").select("kind, mode_key, name, verdict").eq("user_id", userId);
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
  must(await db().from("profile_corrections").insert({ user_id: userId, ...c }), "profile_corrections.insert");
}

export async function removeCorrection(userId: string, c: Pick<Correction, "kind" | "mode_key" | "name">) {
  await deleteCorrection(userId, c);
}

/** Abgelehnte Einträge entfernen (wirkt sofort auf Anzeige, Empfehlungen und Chat). */
export function applyCorrections(profile: StoredTasteProfile, corrections: Correction[]): StoredTasteProfile {
  const rejected = new Set(corrections.filter((c) => c.verdict === "reject").map((c) => correctionKey(c.kind, c.mode_key, c.name)));
  if (!rejected.size) return profile;
  return {
    ...profile,
    modes: profile.modes.map((m) => ({
      ...m,
      drivers: m.drivers.filter((d) => !rejected.has(correctionKey("driver", m.key, d.name))),
      aversions: m.aversions.filter((a) => !rejected.has(correctionKey("aversion", m.key, a.name))),
    })),
    global_aversions: profile.global_aversions.filter((a) => !rejected.has(correctionKey("aversion", null, a.name))),
  };
}

/** Für den Profil-Prompt: was die Person bestätigt bzw. abgelehnt hat. */
export function correctionsForPrompt(corrections: Correction[], modeName: (key: string | null) => string): string {
  if (!corrections.length) return "";
  const line = (c: Correction) => `- ${c.kind === "driver" ? "Treiber" : "Abneigung"} "${c.name}" (${modeName(c.mode_key)})`;
  const confirmed = corrections.filter((c) => c.verdict === "confirm");
  const rejected = corrections.filter((c) => c.verdict === "reject");
  return [
    "\n## Korrekturen der Person am bisherigen Profil (VERBINDLICH)",
    confirmed.length ? "Bestätigt – beibehalten:" : "",
    ...confirmed.map(line),
    rejected.length ? "Abgelehnt – NICHT wieder aufnehmen, auch nicht umformuliert:" : "",
    ...rejected.map(line),
  ]
    .filter(Boolean)
    .join("\n");
}
