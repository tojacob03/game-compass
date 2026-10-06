import { cn } from "@/lib/cn";

/** Ring und Nadel des Zeichens (32er-Raster) – geteilt mit Favicon und App-Icon. */
export const MARK_RING = "M24.27 9.06A10.8 10.8 0 1 0 26.79 16.38";
export const MARK_NEEDLE = "M28.8 16 19.5 13 16.5 16 19.5 19Z";

/**
 * Zeichen: ein "G", dessen Querbalken eine Kompassnadel ist – die Spitze sticht über den Ring hinaus
 * (über das hinaus, was man schon kennt). Ring folgt currentColor, Nadel in Akzentfarbe.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-6 w-6", className)} aria-hidden>
      <path d={MARK_RING} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path d={MARK_NEEDLE} fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className, mark = true }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)} aria-label="GameCompass">
      {mark && <LogoMark />}
      <span className="font-display text-[19px] font-medium leading-none tracking-[-0.02em]" aria-hidden>
        Game<span className="font-normal italic">Compass</span>
      </span>
    </span>
  );
}
