import Link from "next/link";

export type GameCardData = {
  id: string;
  title: string;
  header_image: string | null;
  analyzed_at?: string | null;
};

export function GameCard({
  game,
  meta,
  badge,
}: {
  game: GameCardData;
  meta?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <Link href={`/games/${game.id}`} className="card group overflow-hidden transition hover:border-muted">
      <div className="relative aspect-[460/215] bg-surface-2">
        {game.header_image ? (
          <img src={game.header_image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center font-display text-lg text-muted">{game.title}</div>
        )}
        {badge && <div className="absolute right-2 top-2">{badge}</div>}
      </div>
      <div className="space-y-1 p-3">
        <div className="truncate text-sm font-medium group-hover:text-accent">{game.title}</div>
        {meta && <div className="text-xs text-muted">{meta}</div>}
      </div>
    </Link>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "bg-good text-black" : score >= 5 ? "bg-accent text-accent-ink" : "bg-bad text-black";
  return <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${color}`}>{score}/10</span>;
}
