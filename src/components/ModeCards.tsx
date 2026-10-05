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

/** "Worauf hast du heute Lust?" – ein Einstieg pro Spielmodus. */
export function ModeCards({ modes, images }: { modes: TasteMode[]; images: Img }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {modes.map((m) => (
        <TiltCard key={m.key}>
          <Link href={`/recommendations?mode=${encodeURIComponent(m.key)}`} data-reveal className="group block h-full">
            <SpotlightCard className="flex h-full flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-2 text-3xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]">{m.emoji}</div>
                  <div className="font-display text-xl font-semibold leading-tight transition group-hover:text-accent">{m.name}</div>
                </div>
                <CoverFan covers={covers(m.anchors, images)} size={46} />
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed text-muted">{m.tagline}</p>
              <div className="mt-auto flex items-center justify-between text-xs">
                <span className="truncate text-muted">{m.when}</span>
                <span className="shrink-0 translate-x-[-4px] text-accent opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100">Entdecken →</span>
              </div>
            </SpotlightCard>
          </Link>
        </TiltCard>
      ))}
      <Link href="/recommendations?mode=mix" data-reveal className="group block">
        <div className="flex h-full min-h-44 flex-col justify-center gap-1 rounded-2xl border border-dashed border-line-strong p-5 transition hover:border-accent/60 hover:bg-accent/[0.04]">
          <span className="text-3xl transition group-hover:rotate-12">🎲</span>
          <span className="font-display text-xl font-semibold">Überrasch mich</span>
          <span className="text-sm text-muted">Ein Mix aus allen Modi</span>
        </div>
      </Link>
    </div>
  );
}
