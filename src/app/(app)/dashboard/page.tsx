import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AnalysisRunner } from "@/components/AnalysisRunner";
import { GameCard } from "@/components/GameCard";
import { ModeCards } from "@/components/ModeCards";
import { RebuildProfileButton } from "@/components/ProfileActions";
import { SyncButton } from "@/components/SyncButton";
import { WorkflowSteps } from "@/components/WorkflowSteps";
import { loadCorrections } from "@/lib/corrections";
import { Aurora } from "@/components/ui/Aurora";
import { FitRing } from "@/components/ui/FitRing";
import { Rail } from "@/components/ui/Rail";
import { Reveal } from "@/components/ui/Reveal";
import { SplitHeadline } from "@/components/ui/SplitHeadline";
import { countUserGames, imagesForTitles, latestRecommendations, queueCount } from "@/lib/queries";
import { countUnrated } from "@/lib/quickrate";
import { requireUser } from "@/lib/session";
import { getTasteProfile } from "@/lib/taste";

export default async function Today() {
  const user = await requireUser();
  const [owned, wishlist, rated, queue, unrated, tp, recs, corrections] = await Promise.all([
    countUserGames(user.id, "owned"),
    countUserGames(user.id, "wishlisted"),
    countUserGames(user.id, "rated"),
    queueCount(user.id),
    countUnrated(user.id),
    getTasteProfile(user.id),
    latestRecommendations(user.id),
    loadCorrections(user.id),
  ]);
  const tuned = corrections.filter((c) => c.verdict !== "reject").length;
  const hidden = corrections.length - tuned;
  const images = tp ? await imagesForTitles(tp.profile.modes.flatMap((m) => m.anchors)) : new Map();
  const now = new Date();
  const hour = Number(now.toLocaleString("de-DE", { hour: "numeric", hour12: false, timeZone: "Europe/Berlin" }));
  const greeting = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";
  const date = now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" });

  return (
    <Reveal className="space-y-16">
      <Aurora className="-top-24 h-[60vh]" />

      <section className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-3">
            <p className="eyebrow">
              {date} — {greeting}, {user.display_name}
            </p>
            <SplitHeadline className="text-balance font-display text-5xl font-medium leading-[1.04] tracking-[-0.025em] sm:text-6xl">
              Worauf hast du <span className="italic text-accent">heute</span> Lust?
            </SplitHeadline>
          </div>
        </div>

        {tp ? (
          <ModeCards modes={tp.profile.modes} images={images} />
        ) : (
          <div className="card space-y-4 p-6" data-reveal>
            <p className="max-w-xl text-muted">
              Noch kein Geschmacksprofil. Am schnellsten geht&apos;s so: Steam synchronisieren, ein paar Spiele kurz bewerten –
              daraus erkennt GameCompass deine Spielmodi.
            </p>
            <div className="flex flex-wrap items-start gap-3">
              {!user.last_synced_at && <SyncButton />}
              {user.last_synced_at && (
                <Link href="/rate" className="btn-primary">
                  Schnell bewerten
                </Link>
              )}
              {user.last_synced_at && <RebuildProfileButton label="Profil erstellen" />}
            </div>
          </div>
        )}
      </section>

      {tp && (
        <section className="space-y-3">
          <p className="eyebrow" data-reveal>
            So wird&apos;s genauer
          </p>
          <WorkflowSteps
            steps={[
              {
                href: "/rate",
                title: "Bewerten",
                role: "Was du gespielt hast – schnell per Tipp oder ausführlich mit Note 1–10 und eigenen Worten.",
                status: unrated > 0 ? `${unrated} Spiele warten auf ein Urteil` : "Alles Gespielte ist bewertet",
                highlight: unrated > 0,
              },
              {
                href: "/profile",
                title: "Feinjustieren",
                role: "Was dir wichtig ist – Gewichte setzen, Falsches streichen, Eigenes ergänzen.",
                status: tuned || hidden ? `${tuned} festgelegt · ${hidden} ausgeblendet` : "Noch alles so, wie die KI es sieht",
                highlight: !tuned && !hidden,
              },
              {
                href: "/recommendations",
                title: "Entdecken",
                role: "Neue Spiele pro Modus – jede Reaktion verschiebt die nächste Runde.",
                status: tp.stale ? "Neue Bewertungen fließen in die nächste Runde ein" : recs.length ? `${recs.length} aktuelle Vorschläge` : "Erste Runde holen",
                highlight: tp.stale || !recs.length,
              },
            ]}
          />
        </section>
      )}

      {recs.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-end justify-between" data-reveal>
            <div>
              <p className="eyebrow">Zuletzt gefunden</p>
              <h2 className="h2 mt-1">Für dich ausgesucht</h2>
            </div>
            <Link href="/recommendations" className="group inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-text">
              Alle ansehen <ArrowRight size={14} className="transition group-hover:translate-x-0.5" />
            </Link>
          </div>
          <Rail>
            {recs.slice(0, 10).map((r) => (
              <div key={r.id} className="w-40 shrink-0 snap-start sm:w-44">
                <GameCard
                  game={r.games}
                  badge={<FitRing value={r.fit} size={38} className="rounded-full bg-black/70 backdrop-blur" />}
                  meta={<span className="line-clamp-2">{r.headline}</span>}
                />
              </div>
            ))}
          </Rail>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-5 p-5" data-reveal>
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow">Bibliothek</p>
            <SyncButton variant="ghost" label={user.last_synced_at ? "Neu synchronisieren" : "Steam synchronisieren"} />
          </div>
          <div className="grid grid-cols-3 divide-x divide-line">
            {[
              [owned, "auf Steam"],
              [wishlist, "Wunschliste"],
              [rated, "bewertet"],
            ].map(([n, l]) => (
              <div key={l} className="px-4 first:pl-0">
                <div className="font-display text-4xl font-medium tabular-nums tracking-tight">{n}</div>
                <div className="mt-1 text-xs text-muted">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card space-y-4 p-5" data-reveal>
          <p className="eyebrow">KI-Analyse</p>
          <AnalysisRunner initialRemaining={queue} />
        </div>
      </section>
    </Reveal>
  );
}
