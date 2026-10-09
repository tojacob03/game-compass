import { cn } from "@/lib/cn";
import { supports, type PlatformInfo, type PlatformKey } from "@/lib/platforms";

const SHOWN: { key: PlatformKey; label: (g: Partial<PlatformInfo>) => string; title: (g: Partial<PlatformInfo>) => string }[] = [
  { key: "mac", label: () => "Mac", title: () => "Läuft auf macOS" },
  { key: "linux", label: () => "Linux", title: () => "Läuft auf Linux/SteamOS" },
  {
    key: "deck",
    label: (g) => (g.deck_compat === 3 ? "Deck ✓" : "Deck"),
    title: (g) => (g.deck_compat === 3 ? "Steam Deck: verifiziert" : "Steam Deck: spielbar"),
  },
  {
    key: "gfn",
    label: (g) => (g.gfn_store && g.gfn_store !== "Steam" ? `GFN · ${g.gfn_store === "?" ? "anderer Shop" : g.gfn_store}` : "GFN"),
    title: (g) =>
      g.gfn_store && g.gfn_store !== "Steam"
        ? `GeForce NOW – nur mit der ${g.gfn_store === "?" ? "Version aus einem anderen Shop" : `${g.gfn_store}-Version`}`
        : "GeForce NOW – mit deiner Steam-Version",
  },
];

/** Kleine Plattform-Marken; die eigenen Plattformen der Person sind hervorgehoben. PC wird nicht extra gezeigt. */
export function PlatformBadges({ game, mine = [], className }: { game: Partial<PlatformInfo>; mine?: string[]; className?: string }) {
  const list = SHOWN.filter((p) => supports(game, p.key));
  if (!list.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {list.map((p) => (
        <span
          key={p.key}
          title={p.title(game)}
          className={cn(
            "rounded border px-1.5 py-px font-mono text-[10px] uppercase tracking-wider",
            mine.includes(p.key) ? "border-text/40 text-text" : "border-line text-muted",
          )}
        >
          {p.label(game)}
        </span>
      ))}
    </span>
  );
}
