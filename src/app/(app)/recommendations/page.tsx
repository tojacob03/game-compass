import Link from "next/link";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { RecommendationRunner } from "@/components/RecommendationRunner";
import { db } from "@/lib/db";
import { latestRecommendations } from "@/lib/queries";
import { rankWishlist } from "@/lib/recommend";
import { requireUser } from "@/lib/session";
import { steamStoreUrl } from "@/lib/steam";
import { getTasteProfile } from "@/lib/taste";

type Verdict = "interested" | "not_interested" | "already_played";

export default async function Discover(props: PageProps<"/recommendations">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const tp = await getTasteProfile(user.id);
  const modes = tp?.profile.modes ?? [];
  const param = typeof sp.mode === "string" ? sp.mode : undefined;
  const selected: string | null = param && modes.some((m) => m.key === param) ? param : null;
  const current = modes.find((m) => m.key === selected);
  const modeByKey = new Map(modes.map((m) => [m.key, m]));

  const [recs, wishlist] = await Promise.all([latestRecommendations(user.id, selected), rankWishlist(user.id)]);
  const { data: fb } = recs.length
    ? await db().from("rec_feedback").select("game_id, verdict").eq("user_id", user.id).in("game_id", recs.map((r) => r.games.id))
    : { data: [] };
  const verdicts = new Map(((fb ?? []) as { game_id: string; verdict: Verdict }[]).map((f) => [f.game_id, f.verdict]));
  const wish = (selected ? wishlist.filter((w) => w.modeKey === selected) : wishlist).slice(0, 10);

  const tab = (key: string | null, label: string, emoji: string) => {
    const active = key === selected;
    return (
      <Link
        key={key ?? "mix"}
        href={`/recommendations?mode=${key ?? "mix"}`}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition ${
          active ? "border-accent bg-accent/10 text-text" : "border-line text-muted hover:border-muted hover:text-text"
        }`}
      >
        <span>{emoji}</span>
        {label}
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Entdecken</h1>
        <p className="text-muted">{current ? current.tagline : "Neue Spiele – ausgewählt nach dem, was dich im jeweiligen Modus wirklich antreibt."}</p>
      </div>

      {modes.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {tab(null, "Mix", "🎲")}
          {modes.map((m) => tab(m.key, m.name, m.emoji))}
        </div>
      )}

      <RecommendationRunner hasRecs={recs.length > 0} mode={selected} modeLabel={current ? current.name : "Mix aus allen Modi"} />

      {recs.length > 0 && (
        <section className="space-y-4">
          <p className="text-xs text-muted">Generiert am {new Date(recs[0].created_at).toLocaleString("de-DE")}</p>
          {recs.map((r) => {
            const mode = r.mode_key ? modeByKey.get(r.mode_key) : undefined;
            return (
              <article key={r.id} className="card overflow-hidden md:grid md:grid-cols-[300px_1fr]">
                <Link href={`/games/${r.games.id}`} className="relative block aspect-[460/215] bg-surface-2 md:aspect-auto">
                  {r.games.header_image && <img src={r.games.header_image} alt="" className="h-full w-full object-cover" />}
                  <span className="absolute left-2 top-2 rounded-lg bg-bg/85 px-2 py-1 text-sm font-semibold text-accent backdrop-blur">
                    {r.fit}%
                  </span>
                </Link>
                <div className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/games/${r.games.id}`} className="font-display text-xl font-semibold hover:text-accent">
                      {r.games.title}
                    </Link>
                    {!selected && mode && (
                      <span className="chip">
                        {mode.emoji} {mode.name}
                      </span>
                    )}
                    {r.is_wildcard && <span className="chip !border-[#b18cf0] !text-[#b18cf0]">Wildcard</span>}
                    {r.via_family && <span className="chip !border-good !text-good">In deiner Steam-Familie</span>}
                  </div>
                  <p className="font-medium">{r.headline}</p>
                  <p className="text-sm leading-relaxed text-muted">{r.why}</p>
                  {r.risks && (
                    <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm">
                      <span className="text-bad">Achtung:</span> <span className="text-muted">{r.risks}</span>
                    </p>
                  )}
                  {r.matched_drivers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.matched_drivers.map((d) => (
                        <span key={d} className="chip">
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <FeedbackButtons gameId={r.games.id} initial={verdicts.get(r.games.id) ?? null} />
                    {r.games.steam_appid && (
                      <a href={steamStoreUrl(r.games.steam_appid)} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline">
                        Steam
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {recs.length === 0 && (
        <p className="text-center text-sm text-muted">Für {current ? `„${current.name}“` : "den Mix"} gibt es noch keine Empfehlungen – generier die erste Runde.</p>
      )}

      {wish.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="h2">Von deiner Wunschliste{current ? ` – passend zu „${current.name}“` : ""}</h2>
            <p className="text-sm text-muted">Nach Passung sortiert (nur analysierte Spiele).</p>
          </div>
          <ol className="card divide-y divide-line">
            {wish.map((w, i) => (
              <li key={w.game.id} className="flex items-center gap-3 p-3">
                <span className="w-6 text-right text-sm text-muted">{i + 1}.</span>
                {w.game.header_image && <img src={w.game.header_image} alt="" className="h-9 w-20 rounded object-cover" />}
                <Link href={`/games/${w.game.id}`} className="flex-1 truncate hover:text-accent">
                  {w.game.title}
                </Link>
                {!current && w.modeKey && modeByKey.get(w.modeKey) && (
                  <span className="hidden text-xs text-muted sm:inline">
                    {modeByKey.get(w.modeKey)!.emoji} {modeByKey.get(w.modeKey)!.name}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
