import Link from "next/link";
import { cn } from "@/lib/cn";
import { GameImage } from "./ui/GameImage";

export type GameCardData = {
  id: string;
  title: string;
  header_image: string | null;
  capsule_image?: string | null;
  analyzed_at?: string | null;
};

/**
 * Spielkarte. "poster" = Hochformat-Cover (Bibliothek, Karussells), "wide" = Steam-Header.
 * Hover: Karte hebt sich, Bild zoomt leicht, Lichtkante oben.
 */
export function GameCard({
  game,
  meta,
  badge,
  variant = "poster",
  className,
}: {
  game: GameCardData;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
  variant?: "poster" | "wide";
  className?: string;
}) {
  const poster = variant === "poster";
  return (
    <Link
      href={`/games/${game.id}`}
      data-reveal
      className={cn(
        "group relative block rounded-2xl transition duration-300 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-accent",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-2xl ring-1 ring-white/10 transition duration-300 group-hover:shadow-[0_24px_50px_-24px_rgba(0,0,0,0.9)] group-hover:ring-white/30">
        <GameImage
          src={poster ? (game.capsule_image ?? game.header_image) : game.header_image}
          fallbackSrc={poster ? game.header_image : game.capsule_image}
          title={game.title}
          className={poster ? "aspect-[2/3]" : "aspect-[460/215]"}
          imgClassName="transition duration-500 group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition group-hover:opacity-100" />
        {badge && <div className="absolute right-2 top-2">{badge}</div>}
        {poster && meta && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-10 text-xs text-white/80">{meta}</div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <div className="truncate text-sm transition group-hover:text-text text-text/90">{game.title}</div>
        {!poster && meta && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{meta}</div>}
      </div>
    </Link>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "bg-good text-black" : score >= 5 ? "bg-accent text-accent-ink" : "bg-bad text-black";
  return <span className={`rounded-lg px-2 py-0.5 text-xs font-bold shadow-lg ${color}`}>{score}/10</span>;
}
