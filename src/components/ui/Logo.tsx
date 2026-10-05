import { cn } from "@/lib/cn";

/** Wortmarke + schlichtes Kompass-Zeichen (Kreis, Nadel). Einfarbig, folgt currentColor. */
export function Logo({ className, mark = true }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {mark && (
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden>
          <circle cx="12" cy="12" r="10.25" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
          <path d="M12 3.5 14.4 12 12 20.5 9.6 12Z" fill="currentColor" opacity="0.35" />
          <path d="M12 3.5 14.4 12H9.6Z" fill="var(--accent)" />
          <circle cx="12" cy="12" r="1.2" fill="var(--bg)" />
        </svg>
      )}
      <span className="font-display text-[19px] font-medium tracking-[-0.01em]">
        Game<span className="italic">Compass</span>
      </span>
    </span>
  );
}
