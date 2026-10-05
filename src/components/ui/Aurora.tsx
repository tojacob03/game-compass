import { cn } from "@/lib/cn";

/** Sehr dezentes, einfarbiges Licht von oben (statt bunter Farbflächen). */
export function Aurora({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)} style={{ opacity: intensity }}>
      <div className="absolute left-1/2 top-[-35%] h-[80vh] w-[90vw] -translate-x-1/2 animate-drift rounded-[50%] bg-[radial-gradient(closest-side,rgba(255,246,230,0.07),transparent)]" />
      <div className="absolute right-[8%] top-[-10%] h-[40vh] w-[30vw] animate-drift rounded-[50%] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--accent)_12%,transparent),transparent)]" style={{ animationDelay: "-9s" }} />
    </div>
  );
}
