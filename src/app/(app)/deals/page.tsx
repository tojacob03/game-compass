import { ArrowUpRight, Package } from "lucide-react";
import Link from "next/link";
import { NotifySettings } from "@/components/NotifySettings";
import { PlatformBadges } from "@/components/PlatformBadges";
import { mailConfigured } from "@/lib/mail";
import { settingsOf } from "@/lib/notify";
import { PlatformFilter, PlatformScope } from "@/components/PlatformScope";
import { AnimatedTabs } from "@/components/ui/AnimatedTabs";
import { fallbackLabel, matchesView, parseViewFilter, prefsOf, supports, type ViewFilter } from "@/lib/platforms";
import { FitRing } from "@/components/ui/FitRing";
import { GameImage } from "@/components/ui/GameImage";
import { Reveal } from "@/components/ui/Reveal";
import { env } from "@/lib/env";
import { findDeals, instantGamingSearchUrl, type DealItem } from "@/lib/deals";
import type { Money } from "@/lib/itad";
import { requireUser } from "@/lib/session";
import { steamStoreUrl } from "@/lib/steam";
import { getTasteProfile } from "@/lib/taste";

export const maxDuration = 60;

const FILTERS = [
  { key: "alle", label: "Alle passenden" },
  { key: "wunschliste", label: "Wunschliste" },
  { key: "unter10", label: "Unter 10 €" },
  { key: "unter20", label: "Unter 20 €" },
] as const;

const money = (m: Money | number, currency = "EUR") =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: typeof m === "number" ? currency : m.currency }).format(typeof m === "number" ? m : m.amount);
const until = (iso: string | null) => (iso ? `bis ${new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}` : null);

export default async function Deals(props: PageProps<"/deals">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const filter = FILTERS.some((f) => f.key === sp.f) ? (sp.f as (typeof FILTERS)[number]["key"]) : "alle";
  const [result, tp] = await Promise.all([findDeals(user), getTasteProfile(user.id)]);
  const modeName = new Map((tp?.profile.modes ?? []).map((m) => [m.key, m.name]));

  // Plattform-Ansicht: alles (Ausweich-Deals nur, wenn sie richtig gut sind) oder strikt eingegrenzt
  const prefs = prefsOf(user);
  const mine = prefs.primary;
  const only = parseViewFilter(sp.p);
  const qs = (f: string, p: ViewFilter | null) => `/deals?f=${f}${p ? `&p=${p}` : ""}`;
  const pass = (d: DealItem) =>
    matchesView(d.game, only, prefs) &&
    (filter === "wunschliste" ? d.wishlisted : filter === "unter10" ? d.best.price.amount < 10 : filter === "unter20" ? d.best.price.amount < 20 : true);
  const deals = result.deals.filter(pass).slice(0, 24);

  return (
    <Reveal className="space-y-8">
      <div className="space-y-2">
        <p className="eyebrow">Deals</p>
        <h1 className="h1">
          Angebote, die zu dir <span className="italic text-accent">passen</span>
        </h1>
        <p className="max-w-3xl text-muted">
          Nicht der größte Rabatt zählt, sondern Rabatt × Passung: Wunschliste, deine Empfehlungen und die bestpassenden Spiele aus
          dem Katalog – über alle offiziellen Shops, mit Allzeittief-Vergleich. Was du schon hast oder über deine Steam-Familie spielen
          kannst, fliegt raus.
        </p>
        <PlatformScope user={user} />
      </div>

      {typeof sp.mail === "string" && (
        <p className={`text-sm ${sp.mail === "ungueltig" ? "text-bad" : "text-good"}`}>
          {sp.mail === "bestaetigt"
            ? "Adresse bestätigt – Benachrichtigungen sind an."
            : sp.mail === "abgemeldet"
              ? "Abgemeldet – du bekommst keine Benachrichtigungen mehr."
              : "Der Link ist ungültig oder abgelaufen."}
        </p>
      )}

      {result.configured && (
        <details className="card group p-4" open={typeof sp.mail === "string" || undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
            <span className="font-medium">Per E-Mail benachrichtigen</span>
            <span className="text-muted">
              {user.email_verified_at && settingsOf(user).enabled ? `an · ${user.email}` : "aus"} <span className="inline-block transition group-open:rotate-180">▾</span>
            </span>
          </summary>
          <div className="mt-4">
            <NotifySettings mailReady={mailConfigured()} email={user.email} verified={!!user.email_verified_at} initial={settingsOf(user)} />
          </div>
        </details>
      )}

      {!result.configured ? (
        <section className="card max-w-2xl space-y-3 p-5">
          <h2 className="h2">Noch nicht eingerichtet</h2>
          <p className="text-sm text-muted">
            Für Preise braucht die App einen kostenlosen Key von IsThereAnyDeal: einloggen, unter isthereanydeal.com/apps/my eine
            App registrieren und den Key als <code className="font-mono text-text">ITAD_API_KEY</code> in <code className="font-mono text-text">.env.local</code> und
            in Vercel eintragen.
          </p>
        </section>
      ) : (
        <>
          <div className="space-y-3">
            <AnimatedTabs id="deals" active={filter} items={FILTERS.map((f) => ({ key: f.key, href: qs(f.key, only), label: f.label }))} />
            <PlatformFilter prefs={prefs} active={only} hrefFor={(p) => qs(filter, p)} />
          </div>
          {result.error && <p className="text-sm text-bad">{result.error}</p>}

          {deals.length === 0 ? (
            <p className="py-6 text-sm text-muted">
              Gerade nichts im Angebot{filter !== "alle" ? " in diesem Filter" : ""}. {result.checked} passende Spiele werden beobachtet.
            </p>
          ) : (
            <ol className="grid gap-3 md:grid-cols-2">
              {deals.map((d, i) => (
                <li key={d.game.id} data-reveal className="card flex gap-4 p-3 sm:p-4">
                  <Link href={`/games/${d.game.id}`} className="group shrink-0">
                    <GameImage
                      src={d.game.capsule_image ?? d.game.header_image}
                      fallbackSrc={d.game.header_image}
                      title={d.game.title}
                      className="aspect-[2/3] w-20 rounded-lg ring-1 ring-white/10 sm:w-24"
                      imgClassName="transition duration-500 group-hover:scale-105"
                    />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="eyebrow truncate">
                          {String(i + 1).padStart(2, "0")}
                          {d.modeKey && modeName.get(d.modeKey) ? ` · ${modeName.get(d.modeKey)}` : ""}
                        </p>
                        <Link href={`/games/${d.game.id}`} className="mt-0.5 block truncate font-display text-lg font-medium leading-tight hover:text-accent">
                          {d.game.title}
                        </Link>
                      </div>
                      {d.fit != null && <FitRing value={d.fit} size={40} className="shrink-0" />}
                    </div>

                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="font-display text-2xl font-medium tabular-nums">{money(d.best.price)}</span>
                      <span className="text-sm text-muted line-through tabular-nums">{money(d.best.regular)}</span>
                      <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-[11px] font-semibold text-accent-ink">−{d.best.cut} %</span>
                      <span className="text-sm text-muted">bei {d.best.shop}</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {d.atLow ? (
                        <span className="chip !border-good/50 !text-good">Allzeittief</span>
                      ) : d.historyLow ? (
                        <span className="chip">
                          Tiefstpreis {money(d.historyLow)}
                          {d.nearLow ? " · 12-Monats-Tief" : ""}
                        </span>
                      ) : null}
                      {d.reach === "fallback" && (
                        <span className="chip !border-accent/50 !text-accent" title="Läuft nicht auf deinen Hauptplattformen – steht hier, weil Passung und Preis besonders gut sind">
                          Nur {fallbackLabel(d.game, prefs)}
                        </span>
                      )}
                      <PlatformBadges game={d.game} mine={mine} />
                      {d.game.gfn_store &&
                        d.game.gfn_store !== "Steam" &&
                        mine.includes("gfn") &&
                        !mine.some((k) => k !== "gfn" && supports(d.game, k)) && (
                          <span className="chip !border-bad/50 !text-bad">
                            Für GeForce NOW {d.game.gfn_store === "?" ? "andere Shop-Version" : `${d.game.gfn_store}-Version`} kaufen
                          </span>
                        )}
                      {d.wishlisted && <span className="chip">Wunschliste</span>}
                      {d.recommended && <span className="chip">Empfohlen</span>}
                      {d.best.voucher && <span className="chip">Code: {d.best.voucher}</span>}
                      {until(d.best.expiry) && <span className="chip">{until(d.best.expiry)}</span>}
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
                      <a href={d.best.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-text hover:text-accent">
                        Zum Angebot <ArrowUpRight size={14} />
                      </a>
                      {d.steam && d.steam.shopId !== d.best.shopId && (
                        <a href={d.steam.url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-text">
                          Steam {money(d.steam.price)}
                          {d.steam.cut > 0 ? ` (−${d.steam.cut} %)` : ""}
                        </a>
                      )}
                      {!d.steam && d.game.steam_appid && (
                        <a href={steamStoreUrl(d.game.steam_appid)} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-text">
                          Steam
                        </a>
                      )}
                      <a href={instantGamingSearchUrl(d.game.title)} target="_blank" rel="noopener noreferrer sponsored" className="text-muted hover:text-text">
                        Instant Gaming*
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {result.bundles.length > 0 && filter === "alle" && (
            <section className="space-y-4">
              <div data-reveal>
                <h2 className="h2">Bundles mit deinen Spielen</h2>
                <p className="text-sm text-muted">
                  Mindestens zwei passende Spiele – oder ein Spiel von Wunschliste/Empfehlungen für weniger als die Hälfte. Preis der nötigen
                  Stufe gegen den Normalpreis dieser Spiele; hervorgehoben, was du dir gewünscht hast.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {result.bundles.map((b) => (
                  <a key={b.id} href={b.url} target="_blank" rel="noopener noreferrer" data-reveal className="card group flex flex-col gap-3 p-4 transition hover:border-line-strong">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="eyebrow">
                          <Package size={12} className="mr-1 inline -translate-y-px" />
                          {b.shop}
                          {until(b.expiry) ? ` · ${until(b.expiry)}` : ""}
                        </p>
                        <h3 className="mt-1 font-display text-lg font-medium leading-tight transition group-hover:text-accent">{b.title}</h3>
                      </div>
                      <ArrowUpRight size={16} className="shrink-0 text-muted transition group-hover:text-text" />
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-display text-2xl font-medium tabular-nums">{money(b.price)}</span>
                      <span className="text-sm text-muted">statt {money(b.value, b.price.currency)} für deine {b.matched.length} Spiele</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {b.matched.map((m) => (
                        <span key={m.id} className={`chip ${m.wanted ? "!border-text/40 !text-text" : ""}`}>
                          {m.title}
                          {m.fit != null ? ` · ${m.fit}` : ""}
                        </span>
                      ))}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          <footer className="space-y-1 border-t border-line pt-4 text-xs text-muted">
            <p>
              Preise und Bundles von{" "}
              <a href="https://isthereanydeal.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
                IsThereAnyDeal
              </a>{" "}
              – nur offizielle Shops
              {result.updatedAt ? `, Stand ${new Date(result.updatedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}` : ""}. Passung = Platz im
              Katalog nach deinem Geschmack (100 = passt am besten).
              {result.familyCount > 0 ? ` ${result.familyCount} passende Spiele sind ausgeblendet, weil du sie über deine Steam-Familie spielen kannst.` : ""}
            </p>
            <p>
              * Instant Gaming ist ein Key-Händler außerhalb der offiziellen Shops; der Link öffnet nur die Suche
              {env().INSTANT_GAMING_REF.trim() ? " und enthält einen Empfehlungscode des Betreibers dieser App" : ""}.
            </p>
          </footer>
        </>
      )}
    </Reveal>
  );
}
