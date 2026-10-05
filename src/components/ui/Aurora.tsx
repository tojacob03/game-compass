import { cn } from "@/lib/cn";

/** Langsam wabernde Farbflächen als Hintergrund (reines CSS, kein JS). */
export function Aurora({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)} style={{ opacity: intensity }}>
      <div className="absolute -left-[10%] -top-[30%] h-[70vh] w-[60vw] animate-aurora rounded-full bg-accent/20 blur-[120px]" />
      <div
        className="absolute -right-[15%] top-[-10%] h-[60vh] w-[55vw] animate-aurora rounded-full bg-accent-2/25 blur-[130px]"
        style={{ animationDelay: "-6s" }}
      />
      <div
        className="absolute bottom-[-30%] left-[25%] h-[50vh] w-[50vw] animate-aurora rounded-full bg-accent-3/10 blur-[140px]"
        style={{ animationDelay: "-12s" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,var(--bg)_75%)]" />
    </div>
  );
}
