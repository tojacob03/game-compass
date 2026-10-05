import Link from "next/link";
import { AnalysisRunner } from "@/components/AnalysisRunner";
import { GameCard } from "@/components/GameCard";
import { ModeCards } from "@/components/ModeCards";
import { RebuildProfileButton } from "@/components/ProfileActions";
import { SyncButton } from "@/components/SyncButton";
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
  const hour = new Date().toLocaleString("de-DE", { hour: "numeric", hour12: false, timeZone: "Europe/Berlin" });
  const greeting = Number(hour) < 11 ? "Guten Morgen" : Number(hour) < 18 ? "Hi" : "Guten Abend";

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              {greeting}, {user.display_name}
            </p>
            <h1 className="h1 !text-3xl sm:!text-4xl">Worauf hast du heute Lust?</h1>
          </div>
          {tp?.stale && <RebuildProfileButton label="Profil aktualisieren" />}
        </div>

        {tp ? (
          <ModeCards modes={tp.profile.modes} images={images} />
        ) : (
          <div className="card space-y-4 p-6">
            <p className="text-muted">
              Noch kein Geschmacksprofil. So geht&apos;s am schnellsten: Steam synchronisieren, ein paar Spiele schnell bewerten –
              daraus erkennt GameCompass deine verschiedenen Spielmodi.
            </p>
            <div className="flex flex-wrap gap-3">
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
        <Link href="/rate" className="card group flex items-center gap-4 p-4 transition hover:border-accent/60">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-2xl text-accent-ink">⚡</span>
          <div className="min-w-0 flex-1">
            <div className="font-medium group-hover:text-accent">
              {unrated} gespielte Spiele warten auf ein kurzes Urteil
            </div>
            <div className="text-sm text-muted">Ein Tipp pro Spiel, ca. 10 Sekunden – schärft deine Modi am meisten.</div>
          </div>
          <span className="hidden text-sm text-accent sm:inline">Los →</span>
        </Link>
      )}

      {recs.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="h2">Zuletzt für dich gefunden</h2>
            <Link href="/recommendations" className="text-sm text-accent">
              Alle →
            </Link>
          </div>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            {recs.slice(0, 8).map((r) => (
              <div key={r.id} className="w-64 shrink-0 snap-start">
                <GameCard game={r.games} meta={r.headline} badge={<span className="chip !bg-bg/80">{r.fit}% Fit</span>} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="h2">Bibliothek</h2>
            <SyncButton label={user.last_synced_at ? "Neu syncen" : "Steam synchronisieren"} />
          </div>
          <p className="text-sm text-muted">
            {owned} Steam-Spiele · {wishlist} auf der Wunschliste · {rated} bewertet
          </p>
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="h2">KI-Analyse</h2>
          <AnalysisRunner initialRemaining={queue} />
        </div>
      </section>
    </div>
  );
}
