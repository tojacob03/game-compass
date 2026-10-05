import Link from "next/link";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { RecommendationRunner } from "@/components/RecommendationRunner";
import { AnimatedTabs } from "@/components/ui/AnimatedTabs";
import { FitRing } from "@/components/ui/FitRing";
import { GameImage } from "@/components/ui/GameImage";
import { Reveal } from "@/components/ui/Reveal";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
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

  return (
    <Reveal className="space-y-8">
      <div className="space-y-2">
        <h1 className="h1">
          {current ? (
            <>
              <span className="mr-2">{current.emoji}</span>
              {current.name}
            </>
          ) : (
            "Entdecken"
          )}
        </h1>
        <p className="max-w-3xl text-muted">{current ? current.tagline : "Neue Spiele – ausgewählt nach dem, was dich im jeweiligen Modus wirklich antreibt."}</p>
      </div>

      {modes.length > 0 && (
        <AnimatedTabs
          id="modes"
          active={selected ?? "mix"}
          items={[
            { key: "mix", href: "/recommendations?mode=mix", label: "Mix", icon: "🎲" },
            ...modes.map((m) => ({ key: m.key, href: `/recommendations?mode=${encodeURIComponent(m.key)}`, label: m.name, icon: m.emoji })),
          ]}
        />
      )}

      <div data-reveal>
        <RecommendationRunner hasRecs={recs.length > 0} mode={selected} modeLabel={current ? current.name : "Mix aus allen Modi"} />
      </div>

      {recs.length > 0 ? (
        <section className="space-y-5">
          <p className="text-xs text-muted">Generiert am {new Date(recs[0].created_at).toLocaleString("de-DE")}</p>
          {recs.map((r) => {
            const mode = r.mode_key ? modeByKey.get(r.mode_key) : undefined;
            return (
              <article key={r.id} data-reveal>
                <SpotlightCard className="overflow-hidden">
                  {/* atmosphärischer Hintergrund aus dem Hero-Bild */}
                  {(r.games.hero_image ?? r.games.header_image) && (
                    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                      <img src={(r.games.hero_image ?? r.games.header_image)!} alt="" className="h-full w-full object-cover opacity-[0.12] blur-sm" />
                      <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/90 to-surface/60" />
                    </div>
                  )}
                  <div className="flex gap-4 p-4 sm:gap-6 sm:p-5">
                    <Link href={`/games/${r.games.id}`} className="group shrink-0">
                      <GameImage
                        src={r.games.capsule_image ?? r.games.header_image}
                        fallbackSrc={r.games.header_image}
                        title={r.games.title}
                        className="aspect-[2/3] w-24 rounded-xl shadow-2xl shadow-black/60 ring-1 ring-white/10 sm:w-36"
                        imgClassName="transition duration-500 group-hover:scale-105"
                      />
                    </Link>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {!selected && mode && (
                              <span className="chip">
                                {mode.emoji} {mode.name}
                              </span>
                            )}
                            {r.is_wildcard && <span className="chip !border-accent-2/50 !text-accent-2">✦ Wildcard</span>}
                            {r.via_family && <span className="chip !border-good/50 !text-good">In deiner Steam-Familie</span>}
                          </div>
                          <Link href={`/games/${r.games.id}`} className="block font-display text-2xl font-semibold leading-tight hover:text-accent">
                            {r.games.title}
                          </Link>
                        </div>
                        <FitRing value={r.fit} size={54} className="shrink-0" />
                      </div>
                      <p className="font-medium">{r.headline}</p>
                      <p className="text-sm leading-relaxed text-muted">{r.why}</p>
                      {r.risks && (
                        <p className="rounded-xl border border-bad/25 bg-bad/[0.06] px-3 py-2 text-sm">
                          <span className="font-medium text-bad">Achtung:</span> <span className="text-muted">{r.risks}</span>
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
                          <a href={steamStoreUrl(r.games.steam_appid)} target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:text-accent">
                            Steam ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </SpotlightCard>
              </article>
            );
          })}
        </section>
      ) : (
        <p className="py-6 text-center text-sm text-muted" data-reveal>
          Für {current ? `„${current.name}“` : "den Mix"} gibt es noch keine Empfehlungen – generier die erste Runde.
        </p>
      )}

      {wish.length > 0 && (
        <section className="space-y-4">
          <div data-reveal>
            <h2 className="h2">Von deiner Wunschliste{current ? ` – passend zu „${current.name}“` : ""}</h2>
            <p className="text-sm text-muted">Nach Passung sortiert (nur analysierte Spiele).</p>
          </div>
          <ol className="grid gap-2 sm:grid-cols-2">
            {wish.map((w, i) => (
              <li key={w.game.id} data-reveal>
                <Link href={`/games/${w.game.id}`} className="group flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] p-2 pr-3 transition hover:border-line-strong hover:bg-white/[0.05]">
                  <span className="w-6 text-right font-display text-lg text-muted tabular-nums">{i + 1}</span>
                  <GameImage src={w.game.capsule_image} fallbackSrc={w.game.header_image} title={w.game.title} className="h-16 w-11 shrink-0 rounded-md ring-1 ring-white/10" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium transition group-hover:text-accent">{w.game.title}</div>
                    {!current && w.modeKey && modeByKey.get(w.modeKey) && (
                      <div className="truncate text-xs text-muted">
                        {modeByKey.get(w.modeKey)!.emoji} {modeByKey.get(w.modeKey)!.name}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </Reveal>
  );
}
