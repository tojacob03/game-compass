import { cn } from "@/lib/cn";

/**
 * Horizontale Scroll-Reihe, bündig mit dem Seiteninhalt. Auf dem Handy läuft sie bis zum Rand,
 * auf dem Desktop blendet sie rechts weich aus statt hart abzuschneiden.
 */
export function Rail({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="-mx-4 sm:mx-0 sm:[mask-image:linear-gradient(to_right,black_85%,transparent)]">
      <div className={cn("flex snap-x gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:px-0 sm:pr-24", className)}>{children}</div>
    </div>
  );
}
