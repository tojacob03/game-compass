"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Leuchtlinie links neben dem Inhalt, die sich beim Scrollen durch den Abschnitt füllt (GSAP scrub). */
export function TracingBeam({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          ".beam-fill",
          { scaleY: 0 },
          { scaleY: 1, ease: "none", scrollTrigger: { trigger: ref.current, start: "top 70%", end: "bottom 60%", scrub: 0.6 } },
        );
        gsap.utils.toArray<HTMLElement>(".beam-dot", ref.current).forEach((dot) => {
          gsap.fromTo(
            dot,
            { scale: 0.4, backgroundColor: "rgba(255,255,255,0.15)" },
            { scale: 1, backgroundColor: "var(--accent)", boxShadow: "0 0 18px var(--accent)", scrollTrigger: { trigger: dot, start: "top 70%", toggleActions: "play none none reverse" } },
          );
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className="relative pl-6 sm:pl-10">
      <div aria-hidden className="absolute bottom-0 left-2 top-2 w-px bg-white/10 sm:left-4">
        <div className="beam-fill h-full w-full origin-top bg-gradient-to-b from-accent via-accent-2 to-accent-3" />
      </div>
      {children}
    </div>
  );
}

/** Markierungspunkt auf der Linie – im Kind-Element relativ positionieren. */
export function BeamDot() {
  return <span aria-hidden className="beam-dot absolute -left-[22px] top-7 h-3 w-3 rounded-full bg-accent ring-4 ring-bg sm:-left-[30px]" />;
}
