import Link from "next/link";
import type { TitleImage } from "@/lib/queries";
import { GameImage } from "./ui/GameImage";

/** "Ähnlich zu deinem …" – die nächsten eigenen Spiele mit Cover. */
export function SimilarOwn({
  items,
  images,
  label = "Ähnlich zu deinem",
}: {
  items: { game_id: string; title: string; sim: number }[];
  images: Map<string, TitleImage & { title: string }>;
  label?: string;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
      <span>{label}</span>
      {items.map((s) => {
        const img = images.get(s.game_id);
        return (
          <Link
            key={s.game_id}
            href={`/games/${s.game_id}`}
            className="group inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] py-0.5 pl-0.5 pr-2.5 text-text transition hover:border-accent/50"
            title={`Erlebnis-Ähnlichkeit ${Math.round(s.sim * 100)}`}
          >
            <GameImage src={img?.capsule_image ?? img?.header_image} fallbackSrc={img?.header_image} title={s.title} className="h-6 w-6 rounded-full" />
            <span className="max-w-40 truncate group-hover:text-accent">{s.title}</span>
          </Link>
        );
      })}
    </div>
  );
}
