"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useRef } from "react";
import { cn } from "@/lib/cn";

gsap.registerPlugin(SplitText, useGSAP);

/** Überschrift, deren Wörter beim Laden nacheinander hereinweichen. */
export function SplitHeadline({ children, className, as: Tag = "h1" }: { children: React.ReactNode; className?: string; as?: "h1" | "h2" | "p" }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      if (!ref.current) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const split = SplitText.create(ref.current!, { type: "words", mask: "words" });
        gsap.from(split.words, { yPercent: 110, opacity: 0, duration: 0.9, ease: "expo.out", stagger: 0.045 });
        return () => split.revert();
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref} className={cn(className)}>
      {children}
    </Tag>
  );
}
