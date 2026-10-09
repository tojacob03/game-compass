import Link from "next/link";
import { AnchorStrip } from "@/components/ModeCards";
import { Reveal } from "@/components/ui/Reveal";
import { BeamDot, TracingBeam } from "@/components/ui/TracingBeam";
import { PlatformPicker } from "@/components/PlatformPicker";
import { normalizePlatforms } from "@/lib/platforms";
import { AboutMeForm, EvalRunner, RebuildProfileButton } from "@/components/ProfileActions";
import { AddFacet, FacetControls, RejectedList } from "@/components/ProfileCorrections";
import { loadCorrections } from "@/lib/corrections";
import { imagesForTitles } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { getTasteProfile } from "@/lib/taste";

export default async function Profile() {
  const user = await requireUser();
  const [tp, corrections] = await Promise.all([getTasteProfile(user.id), loadCorrections(user.id)]);
  const p = tp?.profile;
  const images = p ? await imagesForTitles(p.modes.flatMap((m) => m.anchors)) : new Map();

  return (
    <Reveal className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Schritt 02 · Feinjustieren</p>
          <h1 className="h1 mt-1">Mein Geschmack</h1>
          <p className="max-w-2xl text-muted">
            {tp
              ? "Hier legst du fest, was dir wichtig ist. Jede Änderung wirkt sofort auf die nächste Empfehlungsrunde und den Chat."
              : "Noch kein Profil – bewerte ein paar Spiele und erstelle es dann."}
          </p>
        </div>
        <div className="space-y-1.5 sm:text-right">
          <RebuildProfileButton label={tp ? "Aus Bewertungen neu ableiten" : "Profil erstellen"} />
          {tp && (
            <p className="text-xs text-muted">
              Zuletzt {new Date(tp.updated_at).toLocaleDateString("de-DE")}
              {tp.stale ? " · neue Bewertungen fließen bei der nächsten Empfehlungsrunde automatisch ein" : ""}
            </p>
          )}
        </div>
      </div>

      <section id="plattformen" className="card scroll-mt-24 space-y-3 p-5">
        <div>
          <h2 className="h2">Worauf spielst du?</h2>
          <p className="text-sm text-muted">
            Empfehlungen, Deals, Wunschliste und Chat zeigen nur Spiele, die auf mindestens einer dieser Plattformen laufen.
            GeForce NOW laut offizieller NVIDIA-Liste, Steam Deck ab „spielbar“.
          </p>
        </div>
        <PlatformPicker initial={normalizePlatforms(user.platforms)} />
      </section>

      {p && (
        <>
          <section className="card p-5">
            <p className="leading-relaxed sm:text-lg">{p.summary}</p>
            <dl className="mt-5 grid gap-4 border-t border-line pt-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="flex items-center gap-1.5 font-medium">
                  <span className="flex gap-1">
                    {[1, 2, 3].map((n) => <span key={n} className="h-1.5 w-1.5 rounded-full bg-accent" />)}
                    <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
                  </span>
                  Punkte antippen
                </dt>
                <dd className="mt-1 text-muted">Wie wichtig dir ein Treiber ist bzw. wie sehr dich etwas stört – 5 Punkte = No-Go.</dd>
              </div>
              <div>
                <dt className="font-medium">✕ Stimmt nicht</dt>
                <dd className="mt-1 text-muted">Wird ausgeblendet und kommt auch beim Neuableiten nicht wieder.</dd>
              </div>
              <div>
                <dt className="font-medium">+ Eigenes ergänzen</dt>
                <dd className="mt-1 text-muted">Was die KI aus deinen Spielen nicht sehen kann – z. B. „Koop mit Freunden“ oder „Zeitdruck“.</dd>
              </div>
            </dl>
          </section>

          <TracingBeam>
          <div className="space-y-8">
            {p.modes.map((m) => (
              <section key={m.key} className="card relative overflow-visible" data-reveal>
                <BeamDot />
                <div className="flex flex-wrap items-center gap-4 rounded-t-2xl border-b border-line bg-white/[0.02] p-5">
                  <span className="font-mono text-3xl font-light tabular-nums text-muted/60">{String(p.modes.indexOf(m) + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-2xl font-medium tracking-[-0.01em]">{m.name}</h2>
                    <p className="text-muted">{m.tagline}</p>
                    {m.when && <p className="mt-2 text-xs text-muted/80">{m.when}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <AnchorStrip titles={m.anchors} images={images} size="md" />
                    <Link href={`/recommendations?mode=${encodeURIComponent(m.key)}`} className="text-sm text-accent">
                      Empfehlungen für diesen Modus →
                    </Link>
                  </div>
                </div>
                <div className="grid gap-6 p-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="label !text-good">Was dich hier antreibt</h3>
                    {[...m.drivers].sort((a, b) => b.weight - a.weight).map((d) => (
                      <div key={d.name}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="pt-0.5 font-medium">{d.name}</span>
                          <FacetControls item={{ kind: "driver", modeKey: m.key, name: d.name }} value={d.weight} tuned={!!d.tuned} own={!!d.own} />
                        </div>
                        {d.description && <p className="text-sm text-muted">{d.description}</p>}
                        {!d.own && <p className="text-xs text-muted/80">Belege: {d.evidence.join(", ")}</p>}
                      </div>
                    ))}
                    <AddFacet kind="driver" modeKey={m.key} placeholder="z. B. Basis langsam ausbauen: von nichts zur Festung" />
                  </div>
                  <div className="space-y-3">
                    <h3 className="label !text-bad">Was dich hier stört</h3>
                    {m.aversions.length === 0 && <p className="text-sm text-muted">Noch nichts erkannt.</p>}
                    {[...m.aversions].sort((a, b) => b.severity - a.severity).map((a) => (
                      <div key={a.name}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="pt-0.5 font-medium">{a.name}</span>
                          <FacetControls item={{ kind: "aversion", modeKey: m.key, name: a.name }} value={a.severity} tuned={!!a.tuned} own={!!a.own} />
                        </div>
                        {a.description && <p className="text-sm text-muted">{a.description}</p>}
                      </div>
                    ))}
                    <AddFacet kind="aversion" modeKey={m.key} placeholder="z. B. Zeitlimits, die mich hetzen" />
                    <details className="pt-2 text-sm">
                      <summary className="cursor-pointer text-muted hover:text-text">Wonach gesucht wird</summary>
                      <div className="mt-2 space-y-2">
                        {m.search_intents.map((i) => (
                          <p key={i.label} className="text-muted">
                            <span className="text-text">{i.label}:</span> {i.description}
                          </p>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              </section>
            ))}
          </div>
          </TracingBeam>

          <div className="grid gap-4 md:grid-cols-3">
            <section className="card space-y-2 p-4">
              <h3 className="font-display font-semibold text-bad">In jedem Modus ein No-Go</h3>
              {p.global_aversions.length === 0 && <p className="text-sm text-muted">Nichts Modus-übergreifendes erkannt.</p>}
              <ul className="space-y-3 text-sm">
                {p.global_aversions.map((a) => (
                  <li key={a.name} className="space-y-1">
                    <div className="text-text">{a.name}</div>
                    <FacetControls item={{ kind: "aversion", modeKey: null, name: a.name }} value={a.severity} tuned={!!a.tuned} own={!!a.own} />
                    {a.description && <p className="text-muted">{a.description}</p>}
                  </li>
                ))}
              </ul>
              <AddFacet kind="aversion" modeKey={null} placeholder="z. B. Mikrotransaktionen" />
            </section>
            <section className="card space-y-2 p-4">
              <h3 className="font-display font-semibold">Offene Fragen</h3>
              <ul className="ml-4 list-disc space-y-1 text-sm text-muted">
                {p.open_questions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <Link href="/chat" className="text-xs text-accent">
                Im Chat beantworten →
              </Link>
            </section>
            <section className="card space-y-2 p-4">
              <h3 className="font-display font-semibold">Neue Richtungen</h3>
              <ul className="ml-4 list-disc space-y-1 text-sm text-muted">
                {p.exploration_edges.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      {p && (
        <RejectedList
          items={corrections
            .filter((c) => c.verdict === "reject")
            .map((c) => ({
              kind: c.kind,
              modeKey: c.mode_key,
              name: c.name,
              modeLabel: c.mode_key ? (p.modes.find((m) => m.key === c.mode_key)?.name ?? "alter Modus") : "alle Modi",
            }))}
        />
      )}

      <section className="card p-5">
        <AboutMeForm initial={user.about_me ?? ""} />
      </section>

      <details className="card group p-5">
        <summary className="cursor-pointer list-none text-sm text-muted transition hover:text-text">
          Für Neugierige: Selbsttest – wie gut trifft die Engine deinen Geschmack?
        </summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">
            Wir verstecken ein paar deiner Lieblingsspiele (≥ 8/10), bauen dein Profil ohne sie neu und schauen, wie weit oben sie
            unter fremden Spielen landen – im Vergleich zu klassischem Tag-Matching und reiner Beliebtheit.
          </p>
          <EvalRunner />
        </div>
      </details>
    </Reveal>
  );
}
