import { ArrowUpRight, Shuffle } from "lucide-react";
import Link from "next/link";
import type { TitleImage } from "@/lib/queries";
import type { TasteMode } from "@/lib/schemas";
import { CoverFan } from "./ui/CoverFan";
import { GameImage } from "./ui/GameImage";
import { SpotlightCard } from "./ui/SpotlightCard";
import { TiltCard } from "./ui/TiltCard";

type Img = Map<string, TitleImage>;

function covers(titles: string[], images: Img) {
  return titles
    .map((t) => ({ title: t, capsule: images.get(t)?.capsule_image ?? null, header: images.get(t)?.header_image ?? null }))
    .filter((c) => c.capsule || c.header);
}

/** Kleine Cover-Reihe (Profil-Seite). */
export function AnchorStrip({ titles, images, size = "sm" }: { titles: string[]; images: Img; size?: "sm" | "md" }) {
  const shown = covers(titles, images).slice(0, size === "sm" ? 3 : 5);
  if (!shown.length) return null;
  return (
    <div className="flex -space-x-3">
      {shown.map((c) => (
        <GameImage
          key={c.title}
          src={c.capsule}
          fallbackSrc={c.header}
          title={c.title}
          className={`${size === "sm" ? "h-14 w-10" : "h-20 w-14"} rounded-md shadow-lg ring-2 ring-bg`}
        />
      ))}
    </div>
  );
}

export const modeIndex = (i: number) => String(i + 1).padStart(2, "0");

/** "Worauf hast du heute Lust?" – ein Einstieg pro Spielmodus. */
export function ModeCards({ modes, images }: { modes: TasteMode[]; images: Img }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {modes.map((m, i) => (
        <TiltCard key={m.key}>
          <Link href={`/recommendations?mode=${encodeURIComponent(m.key)}`} data-reveal className="group block h-full">
            <SpotlightCard className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-4">
                <span className="eyebrow pt-1">Modus {modeIndex(i)}</span>
                <CoverFan covers={covers(m.anchors, images)} size={44} />
              </div>
              <h3 className="mt-4 font-display text-[1.4rem] font-medium leading-[1.15] tracking-[-0.01em]">{m.name}</h3>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{m.tagline}</p>
              <div className="mt-auto flex items-end justify-between gap-4 pt-5">
                {m.when ? <p className="line-clamp-2 text-xs leading-relaxed text-muted/80">{m.when}</p> : <span />}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong text-muted transition group-hover:border-accent group-hover:bg-accent group-hover:text-accent-ink">
                  <ArrowUpRight size={15} strokeWidth={1.8} />
                </span>
              </div>
            </SpotlightCard>
          </Link>
        </TiltCard>
      ))}
      <Link href="/recommendations?mode=mix" data-reveal className="group block">
        <div className="flex h-full min-h-48 flex-col justify-between rounded-2xl border border-dashed border-line-strong p-5 transition hover:border-text/40">
          <span className="eyebrow">Alle Modi</span>
          <div>
            <Shuffle size={20} strokeWidth={1.6} className="mb-3 text-muted transition group-hover:rotate-180 group-hover:text-accent" style={{ transitionDuration: "600ms" }} />
            <span className="font-display text-[1.4rem] font-medium italic">Überrasch mich</span>
            <p className="mt-1 text-sm text-muted">Ein Mix aus allem, was du magst.</p>
          </div>
        </div>
      </Link>
    </div>
  );
}
