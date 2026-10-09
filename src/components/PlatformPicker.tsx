"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { postJson } from "@/lib/client";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

/** "Worauf spielst du?" – Mehrfachauswahl; Empfehlungen, Deals, Wunschliste und Chat richten sich danach. */
export function PlatformPicker({ initial }: { initial: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: PlatformKey) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    if (!next.length) return; // mindestens eine Plattform
    setSelected(next);
    setError(null);
    try {
      await postJson("/api/profile", { action: "platforms", platforms: next });
      start(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
      setSelected(selected);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Plattformen">
        {PLATFORMS.map((p) => {
          const on = selected.includes(p.key);
          return (
            <motion.button
              key={p.key}
              type="button"
              whileTap={{ scale: 0.95 }}
              aria-pressed={on}
              disabled={pending}
              onClick={() => toggle(p.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                on ? "border-text/50 bg-white/[0.07] text-text" : "border-line text-muted hover:border-line-strong hover:text-text"
              }`}
            >
              {on && <Check size={13} strokeWidth={2.2} className="text-accent" />}
              {p.label}
            </motion.button>
          );
        })}
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}
