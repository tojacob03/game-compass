"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/cn";

/** Ring, der sich beim Sichtbarwerden auf den Fit-Wert füllt. */
export function FitRing({ value, size = 52, className }: { value: number; size?: number; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const stroke = 4;
  const r = (size - stroke) / 2;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const color = value >= 85 ? "var(--good)" : value >= 70 ? "var(--accent)" : "var(--muted)";

  return (
    <div className={cn("relative grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg ref={ref} width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: reduce ? pct : 0 }}
          animate={{ pathLength: inView || reduce ? pct : 0 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <span className="absolute text-xs font-semibold tabular-nums">{value}</span>
    </div>
  );
}
