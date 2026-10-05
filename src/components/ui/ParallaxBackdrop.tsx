"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Großes, unscharfes Hintergrundbild, das beim Scrollen langsamer mitläuft (Parallaxe). */
export function ParallaxBackdrop({ src }: { src: string | null | undefined }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.to(".pb-img", { yPercent: 18, scale: 1.08, ease: "none", scrollTrigger: { trigger: ref.current, start: "top top", end: "bottom top", scrub: true } });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  if (!src) return null;
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh] overflow-hidden">
      <img src={src} alt="" className="pb-img h-full w-full scale-105 object-cover opacity-40 blur-2xl saturate-150" />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/70 to-bg" />
    </div>
  );
}
