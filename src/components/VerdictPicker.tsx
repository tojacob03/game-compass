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
