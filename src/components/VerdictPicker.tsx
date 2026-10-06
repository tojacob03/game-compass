"use client";

import { Heart, Meh, ThumbsDown, ThumbsUp } from "lucide-react";
import { motion } from "motion/react";
import { VERDICT_LABEL, type RatingVerdict } from "@/lib/verdicts";

const ICONS: Record<RatingVerdict, typeof Heart> = { love: Heart, good: ThumbsUp, meh: Meh, bad: ThumbsDown };
const ORDER: RatingVerdict[] = ["love", "good", "meh", "bad"];

/** Die vier Urteile – überall gleich (Schnell-Bewerten, Spielseite, "Schon gespielt"). */
export function VerdictPicker({
  value,
  onChange,
  compact,
  disabled,
}: {
  value: RatingVerdict | null;
  onChange: (v: RatingVerdict | null) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`grid grid-cols-4 ${compact ? "gap-1.5" : "gap-2"}`} role="radiogroup" aria-label="Dein Urteil">
      {ORDER.map((v) => {
        const Icon = ICONS[v];
        const on = value === v;
        return (
          <motion.button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            whileTap={{ scale: 0.92 }}
            onClick={() => onChange(on ? null : v)}
            className={`flex flex-col items-center gap-1 rounded-xl border px-1 text-xs transition ${compact ? "py-2" : "py-3"} ${
              on ? "border-text/50 bg-white/[0.06] text-text" : "border-line text-muted hover:border-line-strong hover:text-text"
            }`}
          >
            <Icon size={compact ? 17 : 22} strokeWidth={1.6} className={on ? "text-accent" : ""} fill={on && v === "love" ? "currentColor" : "none"} />
            {VERDICT_LABEL[v]}
          </motion.button>
        );
      })}
    </div>
  );
}

/** Feinstufe 1–10 unter den vier Urteilen – beide bleiben synchron (8 = "Gut", 9 = "Liebe ich" …). */
export function FineScore({ value, onChange, disabled }: { value: number | null; onChange: (n: number | null) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="label !mb-0">Genau: Note 1–10</span>
        <span className="font-mono text-xs text-muted tabular-nums">{value != null ? `${value}/10` : "–"}</span>
      </div>
      <div className="grid grid-cols-10 gap-1" role="radiogroup" aria-label="Note von 1 bis 10">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const on = value === n;
          const tone = n >= 9 ? "bg-accent text-accent-ink border-accent" : n >= 7 ? "bg-good text-black border-good" : n >= 5 ? "bg-text/80 text-bg border-text/80" : "bg-bad text-black border-bad";
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onChange(on ? null : n)}
              className={`h-8 rounded-md border text-xs font-semibold tabular-nums transition ${
                on ? tone : value != null && n < value ? "border-line-strong bg-white/[0.06] text-text/70" : "border-line text-muted hover:border-line-strong hover:text-text"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
