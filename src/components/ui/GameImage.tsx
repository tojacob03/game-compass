"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/** Deterministische Farbe pro Titel – damit Platzhalter nicht alle gleich aussehen. */
function hue(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) % 360;
  return h;
}

/**
 * Spielbild mit sauberem Fallback: Fehlt das Bild oder lädt es nicht, gibt es einen gestalteten
 * Platzhalter mit Titel statt eines kaputten Bild-Icons.
 */
export function GameImage({
  src,
  fallbackSrc,
  title,
  className,
  imgClassName,
  priority,
}: {
  src: string | null | undefined;
  fallbackSrc?: string | null;
  title: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}) {
  const sources = [src, fallbackSrc].filter(Boolean) as string[];
  const [index, setIndex] = useState(0);
  const current = sources[index];
  const h = hue(title);

  return (
    <div className={cn("relative overflow-hidden bg-surface-2", className)}>
      {current ? (
        <img
          src={current}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setIndex((i) => i + 1)}
          className={cn("h-full w-full object-cover", imgClassName)}
        />
      ) : (
        <div
          className="flex h-full w-full items-end p-3"
          style={{
            background: `radial-gradient(120% 90% at 0% 0%, hsl(${h} 70% 45% / .55), transparent 60%), radial-gradient(120% 90% at 100% 100%, hsl(${(h + 70) % 360} 70% 40% / .45), transparent 60%), var(--surface-2)`,
          }}
        >
          <span className="line-clamp-3 font-display text-base font-semibold leading-tight text-white/90 drop-shadow">{title}</span>
        </div>
      )}
    </div>
  );
}
