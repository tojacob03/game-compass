/**
 * Plattformen: Worauf läuft ein Spiel, worauf spielt die Person? (Reine Funktionen – Server und Client.)
 * Unbekannt (noch nicht abgefragt, Nicht-Steam-Spiel) zählt als spielbar, damit nichts vorschnell verschwindet.
 */
export const PLATFORMS = [
  { key: "windows", label: "Windows-PC", short: "PC" },
  { key: "mac", label: "Mac", short: "Mac" },
  { key: "linux", label: "Linux", short: "Linux" },
  { key: "deck", label: "Steam Deck", short: "Deck" },
  { key: "gfn", label: "GeForce NOW", short: "GFN" },
] as const;
export type PlatformKey = (typeof PLATFORMS)[number]["key"];
export const PLATFORM_KEYS = PLATFORMS.map((p) => p.key) as PlatformKey[];
export const platformLabel = (k: PlatformKey) => PLATFORMS.find((p) => p.key === k)!.label;

export type PlatformInfo = {
  plat_windows: boolean | null;
  plat_mac: boolean | null;
  plat_linux: boolean | null;
  deck_compat: number | null;
  gfn_store: string | null;
  platforms_fetched_at: string | null;
};
export const PLATFORM_COLUMNS = "plat_windows, plat_mac, plat_linux, deck_compat, gfn_store, platforms_fetched_at";

/** true/false, oder null wenn unbekannt. */
export function supports(g: Partial<PlatformInfo>, key: PlatformKey): boolean | null {
  if (key === "gfn") return g.gfn_store ? true : g.platforms_fetched_at ? false : null;
  if (!g.platforms_fetched_at) return null;
  if (key === "windows") return g.plat_windows !== false;
  if (key === "mac") return !!g.plat_mac;
  if (key === "linux") return !!g.plat_linux;
  return (g.deck_compat ?? 0) >= 2; // spielbar oder verifiziert
}

/** Auf mindestens einer der Plattformen spielbar (unbekannt = ja). */
export function playableOn(g: Partial<PlatformInfo>, keys: readonly string[]): boolean {
  if (!keys.length) return true;
  return keys.some((k) => supports(g, k as PlatformKey) !== false);
}

export function normalizePlatforms(v: unknown): PlatformKey[] {
  const list = Array.isArray(v) ? v.filter((x): x is PlatformKey => PLATFORM_KEYS.includes(x as PlatformKey)) : [];
  return list.length ? list : ["windows"];
}

/** Nur Windows = keine Einschränkung (praktisch alles läuft dort). */
export const isRestricted = (keys: readonly string[]) => !keys.includes("windows");

/** Kurzfassung für Prompts/Tools, z. B. "PC, Mac, Deck, GFN (über Epic)". */
export function platformSummary(g: Partial<PlatformInfo>): string {
  if (!g.platforms_fetched_at && !g.gfn_store) return "unbekannt";
  const parts: string[] = PLATFORMS.filter((p) => supports(g, p.key)).map((p) => p.short);
  if (g.gfn_store && g.gfn_store !== "Steam" && parts.includes("GFN")) parts[parts.indexOf("GFN")] = `GFN (über ${g.gfn_store === "?" ? "anderen Shop" : g.gfn_store})`;
  return parts.join(", ") || "keine";
}
