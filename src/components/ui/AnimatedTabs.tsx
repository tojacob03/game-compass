"use client";

import Link from "next/link";
import { LayoutGroup, motion } from "motion/react";
import { cn } from "@/lib/cn";

export type TabItem = { key: string; href: string; label: string; index?: string };

/** Tab-Leiste, deren Markierung weich zum aktiven Tab gleitet. */
export function AnimatedTabs({ items, active, id, className }: { items: TabItem[]; active: string; id: string; className?: string }) {
  return (
    <LayoutGroup id={id}>
      <div className={cn("-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]", className)}>
        {items.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              scroll={false}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors",
                on ? "text-text" : "text-muted hover:text-text",
              )}
            >
              {on && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-white/[0.08] ring-1 ring-line-strong"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              {t.index && <span className={cn("font-mono text-[10px]", on ? "text-accent" : "text-muted/70")}>{t.index}</span>}
              {t.label}
            </Link>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
