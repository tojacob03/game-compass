import Link from "next/link";
import { AnalysisRunner } from "@/components/AnalysisRunner";
import { GameCard } from "@/components/GameCard";
import { ModeCards } from "@/components/ModeCards";
import { RebuildProfileButton } from "@/components/ProfileActions";
import { SyncButton } from "@/components/SyncButton";
import { Aurora } from "@/components/ui/Aurora";
import { FitRing } from "@/components/ui/FitRing";
import { Reveal } from "@/components/ui/Reveal";
import { SplitHeadline } from "@/components/ui/SplitHeadline";
import { countUserGames, imagesForTitles, latestRecommendations, queueCount } from "@/lib/queries";
import { countUnrated } from "@/lib/quickrate";
import { requireUser } from "@/lib/session";
import { getTasteProfile } from "@/lib/taste";

export default async function Today() {
  const user = await requireUser();
  const [owned, wishlist, rated, queue, unrated, tp, recs] = await Promise.all([
    countUserGames(user.id, "owned"),
    countUserGames(user.id, "wishlisted"),
    countUserGames(user.id, "rated"),
    queueCount(user.id),
    countUnrated(user.id),
    getTasteProfile(user.id),
    latestRecommendations(user.id),
  ]);
  const images = tp ? await imagesForTitles(tp.profile.modes.flatMap((m) => m.anchors)) : new Map();
  const hour = Number(new Date().toLocaleString("de-DE", { hour: "numeric", hour12: false, timeZone: "Europe/Berlin" }));
  const greeting = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hi" : "Guten Abend";

  return (
    <Reveal className="space-y-12">
      <Aurora className="-top-24 h-[60vh]" intensity={0.55} />

      <section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              {greeting}, {user.display_name}
            </p>
            <SplitHeadline className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Worauf hast du <span className="text-gradient">heute</span> Lust?
            </SplitHeadline>
          </div>
          {tp?.stale && (
            <div className="w-full max-w-xs" data-reveal>
              <RebuildProfileButton label="Profil mit neuen Bewertungen aktualisieren" />
            </div>
          )}
        </div>

        {tp ? (
          <ModeCards modes={tp.profile.modes} images={images} />
        ) : (
          <div className="card space-y-4 p-6" data-reveal>
            <p className="text-muted">
              Noch kein Geschmacksprofil. Am schnellsten: Steam synchronisieren, ein paar Spiele schnell bewerten – daraus erkennt
              GameCompass deine Spielmodi.
            </p>
            <div className="flex flex-wrap items-start gap-3">
              {!user.last_synced_at && <SyncButton />}
              {user.last_synced_at && (
                <Link href="/rate" className="btn-primary">
                  ⚡ Schnell bewerten
                </Link>
              )}
              {user.last_synced_at && <RebuildProfileButton label="Profil erstellen" />}
            </div>
          </div>
        )}
      </section>

      {unrated > 0 && (
        <Link
          href="/rate"
          data-reveal
          className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-r from-accent/[0.12] via-accent-2/[0.08] to-transparent p-4 transition hover:border-accent/60"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-2xl text-accent-ink shadow-[0_0_30px_-6px_var(--accent)] transition group-hover:scale-110">
            ⚡
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{unrated} gespielte Spiele warten auf ein kurzes Urteil</div>
            <div className="text-sm text-muted">Ein Tipp oder Swipe pro Spiel – schärft deine Modi am meisten.</div>
          </div>
          <span className="hidden text-sm text-accent transition group-hover:translate-x-1 sm:inline">Los →</span>
        </Link>
      )}

      {recs.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between" data-reveal>
            <h2 className="h2">Zuletzt für dich gefunden</h2>
            <Link href="/recommendations" className="text-sm text-accent">
              Alle →
            </Link>
          </div>
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
            {recs.slice(0, 10).map((r) => (
              <div key={r.id} className="w-40 shrink-0 snap-start sm:w-44">
                <GameCard
                  game={r.games}
                  badge={<FitRing value={r.fit} size={40} className="rounded-full bg-black/60 backdrop-blur" />}
                  meta={<span className="line-clamp-2">{r.headline}</span>}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3 p-5" data-reveal>
          <div className="flex items-center justify-between gap-3">
            <h2 className="h2">Bibliothek</h2>
            <SyncButton label={user.last_synced_at ? "Neu syncen" : "Steam synchronisieren"} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              [owned, "auf Steam"],
              [wishlist, "Wunschliste"],
              [rated, "bewertet"],
            ].map(([n, l]) => (
              <div key={l} className="rounded-xl bg-white/[0.03] py-3">
                <div className="font-display text-2xl font-semibold tabular-nums">{n}</div>
                <div className="text-xs text-muted">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card space-y-3 p-5" data-reveal>
          <h2 className="h2">KI-Analyse</h2>
          <AnalysisRunner initialRemaining={queue} />
        </div>
      </section>
    </Reveal>
  );
}
