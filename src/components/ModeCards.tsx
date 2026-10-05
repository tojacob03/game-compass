import Link from "next/link";
import type { TasteMode } from "@/lib/schemas";

type Img = Map<string, { id: string; header_image: string | null }>;

export function AnchorStrip({ titles, images, size = "sm" }: { titles: string[]; images: Img; size?: "sm" | "md" }) {
  const shown = titles.map((t) => ({ t, g: images.get(t) })).filter((x) => x.g?.header_image).slice(0, size === "sm" ? 3 : 5);
  if (!shown.length) return null;
  return (
    <div className="flex -space-x-3">
      {shown.map(({ t, g }) => (
        <img
          key={t}
          src={g!.header_image!}
          alt={t}
          title={t}
          className={`${size === "sm" ? "h-9 w-[4.3rem]" : "h-12 w-[5.7rem]"} rounded-md object-cover ring-2 ring-surface`}
        />
      ))}
    </div>
  );
}

/** "Worauf hast du heute Lust?" – ein Einstieg pro Spielmodus. */
export function ModeCards({ modes, images }: { modes: TasteMode[]; images: Img }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {modes.map((m) => (
        <Link
          key={m.key}
          href={`/recommendations?mode=${encodeURIComponent(m.key)}`}
          className="card group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:border-accent/60"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-2xl">{m.emoji}</span>
            <div className="min-w-0">
              <div className="font-display text-lg font-semibold leading-tight group-hover:text-accent">{m.name}</div>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted">{m.tagline}</p>
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2">
            <AnchorStrip titles={m.anchors} images={images} />
            <span className="text-xs text-accent opacity-0 transition group-hover:opacity-100">Entdecken →</span>
          </div>
        </Link>
      ))}
      <Link
        href="/recommendations?mode=mix"
        className="card flex flex-col justify-center gap-1 border-dashed p-4 transition hover:border-accent/60"
      >
        <span className="text-2xl">🎲</span>
        <span className="font-display text-lg font-semibold">Überrasch mich</span>
        <span className="text-sm text-muted">Ein Mix aus allen Modi</span>
      </Link>
    </div>
  );
}
