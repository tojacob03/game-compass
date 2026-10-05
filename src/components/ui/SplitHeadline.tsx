"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useRef } from "react";
import { cn } from "@/lib/cn";

gsap.registerPlugin(SplitText, useGSAP);

/**
 * Überschrift, deren Wörter beim Laden nacheinander hereingleiten.
 * - Ohne Masken: Masken schneiden kursive Überhänge (z. B. das "l" in "weil") ab.
 * - Erst nach dem Laden der Webfonts aufteilen, sonst passen die Maße nicht zur endgültigen Schrift.
 * - Nach der Animation wird alles zu normalem Text zurückgebaut – es bleiben keine Hilfs-Elemente stehen.
 */
export function SplitHeadline({ children, className, as: Tag = "h1" }: { children: React.ReactNode; className?: string; as?: "h1" | "h2" | "p" }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        let split: SplitText | null = null;
        let tween: gsap.core.Tween | null = null;
        let cancelled = false;
        const start = () => {
          if (cancelled || split) return;
          split = SplitText.create(el, { type: "words" });
          gsap.set(el, { visibility: "visible" });
          tween = gsap.from(split.words, {
            y: "0.35em",
            opacity: 0,
            filter: "blur(10px)",
            duration: 1,
            ease: "expo.out",
            stagger: 0.055,
            onComplete: () => {
              split?.revert();
              split = null;
            },
          });
        };
        document.fonts.ready.then(start);
        const fallback = window.setTimeout(start, 1500); // falls Fonts hängen: trotzdem anzeigen
        return () => {
          cancelled = true;
          window.clearTimeout(fallback);
          tween?.kill();
          split?.revert();
          gsap.set(el, { clearProps: "visibility" });
        };
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref} data-split-headline className={cn(className)}>
      {children}
    </Tag>
  );
}
