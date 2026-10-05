"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Blendet alle Kinder mit [data-reveal] beim Scrollen gestaffelt ein (GSAP ScrollTrigger.batch).
 * Bei "Bewegung reduzieren" bleibt alles sofort sichtbar.
 */
export function Reveal({ children, className, y = 28 }: { children: React.ReactNode; className?: string; y?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const items = gsap.utils.toArray<HTMLElement>("[data-reveal]", ref.current);
      if (!items.length) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.set(items, { autoAlpha: 0, y, filter: "blur(6px)" });
        ScrollTrigger.batch(items, {
          start: "top 92%",
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.7, ease: "power3.out", stagger: 0.07, overwrite: true }),
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
