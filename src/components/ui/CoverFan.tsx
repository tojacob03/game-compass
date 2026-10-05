"use client";

import { motion } from "motion/react";
import { GameImage } from "./GameImage";

export type FanCover = { title: string; capsule: string | null; header: string | null };

/** Fächer aus Hochformat-Covern, der sich beim Hover (der Elternkarte: .group) aufspreizt. */
export function CoverFan({ covers, size = 64 }: { covers: FanCover[]; size?: number }) {
  const shown = covers.slice(0, 4);
  const mid = (shown.length - 1) / 2;
  return (
    <motion.div className="relative" style={{ height: size * 1.5, width: size + (shown.length - 1) * size * 0.42 }} initial="rest" whileHover="open" animate="rest">
      {shown.map((c, i) => {
        const off = i - mid;
        return (
          <motion.div
            key={c.title}
            className="absolute top-0 overflow-hidden rounded-lg shadow-xl shadow-black/50 ring-1 ring-white/10"
            style={{ width: size, height: size * 1.5, left: i * size * 0.42, zIndex: shown.length - Math.abs(Math.round(off)) }}
            variants={{
              rest: { rotate: off * 4, y: Math.abs(off) * 3 },
              open: { rotate: off * 9, y: Math.abs(off) * 6 - 6, x: off * 10 },
            }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <GameImage src={c.capsule} fallbackSrc={c.header} title={c.title} className="h-full w-full" />
          </motion.div>
        );
      })}
    </motion.div>
  );
}
