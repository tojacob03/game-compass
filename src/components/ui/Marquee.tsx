import { cn } from "@/lib/cn";

/** Endlos laufende Reihe (reines CSS). Inhalt wird für den nahtlosen Übergang verdoppelt. */
export function Marquee({ children, reverse, duration = 60, className }: { children: React.ReactNode; reverse?: boolean; duration?: number; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]", className)}>
      <div
        className="flex w-max animate-marquee gap-4 hover:[animation-play-state:paused]"
        style={{ ["--marquee-duration" as string]: `${duration}s`, animationDirection: reverse ? "reverse" : "normal" }}
      >
        {children}
        <div aria-hidden className="contents">
          {children}
        </div>
      </div>
    </div>
  );
}
