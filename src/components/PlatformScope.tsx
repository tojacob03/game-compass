import Link from "next/link";
import { platformLabel, PLATFORMS, prefsOf, type PlatformPrefs, type ViewFilter } from "@/lib/platforms";

/** Hinweis "Hauptsächlich Mac · GeForce NOW, notfalls Windows-PC – ändern". */
export function PlatformScope({ user }: { user: { platforms?: unknown; fallback_platforms?: unknown } }) {
  const { primary, fallback } = prefsOf(user);
  return (
    <p className="text-xs text-muted">
      Hauptsächlich <span className="text-text">{primary.map(platformLabel).join(" · ")}</span>
      {fallback.length > 0 && (
        <>
          , notfalls <span className="text-text">{fallback.map(platformLabel).join(" · ")}</span>
        </>
      )}{" "}
      ·{" "}
      <Link href="/profile#plattformen" className="underline decoration-line-strong underline-offset-4 hover:text-text">
        ändern
      </Link>
    </p>
  );
}

/** Filter zum Antippen: alles (Standard), nur Hauptplattformen, oder eine einzelne Plattform. */
export function PlatformFilter({ prefs, active, hrefFor }: { prefs: PlatformPrefs; active: ViewFilter | null; hrefFor: (f: ViewFilter | null) => string }) {
  const singles = PLATFORMS.filter((p) => prefs.primary.includes(p.key) || prefs.fallback.includes(p.key)).map((p) => p.key);
  const options: { key: ViewFilter | null; label: string }[] = [
    { key: null, label: prefs.fallback.length ? "Alle (inkl. Ausweich-Tipps)" : "Alle" },
    ...(prefs.fallback.length || prefs.primary.length > 1 ? [{ key: "main" as const, label: `Nur ${prefs.primary.map(platformLabel).join(" + ")}` }] : []),
    ...(singles.length > 1 ? singles.map((k) => ({ key: k, label: `Nur ${platformLabel(k)}` })) : []),
  ];
  if (options.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-xs" role="group" aria-label="Nach Plattform filtern">
      {options.map((o) => (
        <Link
          key={o.key ?? "alle"}
          href={hrefFor(o.key)}
          className={`rounded-full border px-2.5 py-1 transition ${active === o.key ? "border-text/50 bg-white/[0.06] text-text" : "border-line text-muted hover:text-text"}`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
