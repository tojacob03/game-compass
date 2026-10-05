import Link from "next/link";
import { AnchorStrip } from "@/components/ModeCards";
import { Reveal } from "@/components/ui/Reveal";
import { BeamDot, TracingBeam } from "@/components/ui/TracingBeam";
import { AboutMeForm, EvalRunner, RebuildProfileButton } from "@/components/ProfileActions";
import { CorrectionButtons, RejectedList } from "@/components/ProfileCorrections";
import { correctionKey, loadCorrections } from "@/lib/corrections";
import { imagesForTitles } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { getTasteProfile } from "@/lib/taste";

const dots = (n: number) => "●".repeat(n) + "○".repeat(5 - n);

export default async function Profile() {
  const user = await requireUser();
  const [tp, corrections] = await Promise.all([getTasteProfile(user.id), loadCorrections(user.id)]);
  const confirmed = new Set(corrections.filter((c) => c.verdict === "confirm").map((c) => correctionKey(c.kind, c.mode_key, c.name)));
  const isConfirmed = (kind: string, modeKey: string | null, name: string) => confirmed.has(correctionKey(kind, modeKey, name));
  const p = tp?.profile;
  const images = p ? await imagesForTitles(p.modes.flatMap((m) => m.anchors)) : new Map();

  return (
    <Reveal className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h1">Mein Geschmack</h1>
          <p className="text-muted">
            {tp
              ? `Zuletzt berechnet ${new Date(tp.updated_at).toLocaleString("de-DE")}${tp.stale ? " · es gibt neue Bewertungen" : ""}`
              : "Noch kein Profil – bewerte ein paar Spiele und erstelle es dann."}
          </p>
        </div>
        <RebuildProfileButton label={tp ? "Neu berechnen" : "Profil erstellen"} />
      </div>

      {p && (
        <>
          <section className="card p-5">
            <p className="leading-relaxed sm:text-lg">{p.summary}</p>
            <p className="mt-3 text-xs text-muted">
              Deine Modi entstehen automatisch: Spiele mit ähnlichem Erlebnis werden gruppiert – gewichtet danach, wie sehr sie
              dich gepackt haben (Bewertung oder Spielzeit im Vergleich zur typischen Spielzeit). Besitz allein zählt nicht.
              Mit <span className="text-good">✓</span> bestätigst, mit <span className="text-bad">✕</span> streichst du Einträge – das
              wirkt sofort auf Empfehlungen und Chat und bleibt beim Neuberechnen erhalten.
            </p>
          </section>

          <TracingBeam>
          <div className="space-y-8">
            {p.modes.map((m) => (
              <section key={m.key} className="card relative overflow-visible" data-reveal>
                <BeamDot />
                <div className="flex flex-wrap items-center gap-4 rounded-t-2xl border-b border-line bg-white/[0.02] p-5">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg text-3xl">{m.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-2xl font-semibold">{m.name}</h2>
                    <p className="text-muted">{m.tagline}</p>
                    {m.when && <p className="mt-1 text-xs text-muted">🕒 {m.when}</p>}
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
                    {m.drivers.map((d) => (
                      <div key={d.name}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{d.name}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-accent" title={`Gewicht ${d.weight}/5`}>
                              {dots(d.weight)}
                            </span>
                            <CorrectionButtons item={{ kind: "driver", modeKey: m.key, name: d.name }} confirmed={isConfirmed("driver", m.key, d.name)} />
                          </span>
                        </div>
                        <p className="text-sm text-muted">{d.description}</p>
                        <p className="text-xs text-muted/80">Belege: {d.evidence.join(", ")}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-3">
                    <h3 className="label !text-bad">Was dich hier stört</h3>
                    {m.aversions.length === 0 && <p className="text-sm text-muted">Noch nichts erkannt.</p>}
                    {m.aversions.map((a) => (
                      <div key={a.name}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{a.name}</span>
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-bad">{a.severity >= 5 ? "No-Go" : dots(a.severity)}</span>
                            <CorrectionButtons item={{ kind: "aversion", modeKey: m.key, name: a.name }} confirmed={isConfirmed("aversion", m.key, a.name)} />
                          </span>
                        </div>
                        <p className="text-sm text-muted">{a.description}</p>
                      </div>
                    ))}
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
              <ul className="space-y-1 text-sm text-muted">
                {p.global_aversions.map((a) => (
                  <li key={a.name} className="flex items-start justify-between gap-2">
                    <span>
                      <span className="text-text">{a.name}</span>
                      {a.severity >= 5 && <span className="ml-1 text-xs text-bad">No-Go</span>} – {a.description}
                    </span>
                    <CorrectionButtons item={{ kind: "aversion", modeKey: null, name: a.name }} confirmed={isConfirmed("aversion", null, a.name)} />
                  </li>
                ))}
              </ul>
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

      <section className="card space-y-3 p-5">
        <h2 className="h2">Selbsttest: Wie gut ist die Engine für dich?</h2>
        <p className="text-sm text-muted">
          Wir verstecken ein paar deiner Lieblingsspiele (≥ 8/10), bauen dein Profil ohne sie neu und schauen, wie weit oben sie
          unter fremden Spielen landen – im Vergleich zu klassischem Tag-Matching und reiner Beliebtheit.
        </p>
        <EvalRunner />
      </section>
    </Reveal>
  );
}
