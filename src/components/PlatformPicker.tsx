"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { postJson } from "@/lib/client";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

type Prefs = { primary: string[]; fallback: string[] };

/**
 * Zwei Stufen: Hauptplattformen (normal empfohlen) und Ausweich-Plattformen
 * (nur für besonders passende Spiele und Deals, mit Hinweis). Eine Plattform steht in höchstens einer Zeile.
 */
export function PlatformPicker({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle(row: keyof Prefs, key: PlatformKey) {
    const other: keyof Prefs = row === "primary" ? "fallback" : "primary";
    const on = prefs[row].includes(key);
    const next: Prefs = {
      ...prefs,
      [row]: on ? prefs[row].filter((k) => k !== key) : [...prefs[row], key],
      [other]: prefs[other].filter((k) => k !== key),
    } as Prefs;
    if (!next.primary.length) return; // mindestens eine Hauptplattform
    const before = prefs;
    setPrefs(next);
    setError(null);
    try {
      await postJson("/api/profile", { action: "platforms", platforms: next.primary, fallback: next.fallback });
      start(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
      setPrefs(before);
    }
  }

  const row = (which: keyof Prefs, title: string, hint: string) => (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={title}>
        {PLATFORMS.map((p) => {
          const on = prefs[which].includes(p.key);
          const elsewhere = prefs[which === "primary" ? "fallback" : "primary"].includes(p.key);
          return (
            <motion.button
              key={p.key}
              type="button"
              whileTap={{ scale: 0.95 }}
              aria-pressed={on}
              disabled={pending}
              onClick={() => toggle(which, p.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                on
                  ? which === "primary"
                    ? "border-text/50 bg-white/[0.07] text-text"
                    : "border-dashed border-text/40 text-text"
                  : elsewhere
                    ? "border-line text-muted/50 hover:text-muted"
                    : "border-line text-muted hover:border-line-strong hover:text-text"
              }`}
            >
              {on && <Check size={13} strokeWidth={2.2} className={which === "primary" ? "text-accent" : "text-muted"} />}
              {p.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {row("primary", "Hauptsächlich", "Darauf wird normal empfohlen.")}
      {row(
        "fallback",
        "Notfalls, für besonders Gutes",
        "Spiele, die nur hier laufen, bleiben drin – rutschen aber nach unten und kommen nur bei sehr hoher Passung oder einem starken Deal nach oben, mit Hinweis.",
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
