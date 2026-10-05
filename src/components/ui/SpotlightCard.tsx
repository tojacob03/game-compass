"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

/** Karte mit einem weichen Lichtkegel, der dem Mauszeiger folgt, plus leuchtendem Rand. */
export function SpotlightCard({
  children,
  className,
  color = "rgba(242,181,68,0.14)",
}: {
  children: React.ReactNode;
  className?: string;
  color?: string;
}) {
  const x = useMotionValue(-400);
  const y = useMotionValue(-400);
  const reduce = useReducedMotion();
  const glow = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, ${color}, transparent 70%)`;
  const ring = useMotionTemplate`radial-gradient(260px circle at ${x}px ${y}px, rgba(255,255,255,0.22), transparent 70%)`;

  return (
    <div
      onMouseMove={(e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set(e.clientX - r.left);
        y.set(e.clientY - r.top);
      }}
      onMouseLeave={() => {
        x.set(-400);
        y.set(-400);
      }}
      className={cn("group/spot relative isolate overflow-hidden rounded-2xl border border-line bg-surface/80", className)}
    >
      {/* Rand-Highlight: Maske nur auf dem 1px-Rand */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] p-px opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          background: ring,
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{ background: glow }}
      />
      {children}
    </div>
  );
}
