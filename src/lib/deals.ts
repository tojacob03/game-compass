import "server-only";
import { db, fetchAll, must, selectInChunks } from "./db";
import { env } from "./env";
import { parsePgVector } from "./gemini";
import { getBundles, getPrices, ItadError, itadConfigured, lookupSteamApps, STEAM_SHOP_ID, type ItadBundle, type ItadDeal, type Money } from "./itad";
import { buildPersonalScorer } from "./personal";
import { ensureGfnFresh } from "./gfn";
import { refreshMissingAssets } from "./assets";
import { PLATFORM_COLUMNS, prefsOf, reachOf, type PlatformInfo, type Reach } from "./platforms";

/** Deals, die nur auf einer Ausweich-Plattform laufen, zählen weniger – nur richtig gute landen weit oben. */
const FALLBACK_FACTOR = 0.6;
import { loadIntents, scoreCandidate, wilson } from "./recommend";
import { getTasteProfile } from "./taste";
import type { UserRow } from "./types";

const PRICE_TTL = 6 * 60 * 60 * 1000;
const BUNDLE_TTL = 12 * 60 * 60 * 1000;
/** So viele bestpassende Katalog-Spiele (zusätzlich zu Wunschliste + Empfehlungen) werden auf Angebote geprüft. */
const TOP_CATALOG = 80;
/** Für so viele Spiele werden Bundles geladen (je eine Anfrage, daher begrenzt). */
const BUNDLE_LOOKUPS = 30;

type Deal = Pick<ItadDeal, "cut" | "url" | "expiry" | "voucher"> & { shop: string; shopId: number; price: Money; regular: Money };
type PriceRow = {
  game_id: string;
  deals: Deal[];
  history_low: { all: Money | null; y1: Money | null } | null;
  bundles: StoredBundle[] | null;
  fetched_at: string;
  bundles_fetched_at: string | null;
};
type StoredBundle = {
  id: number;
  title: string;
  shop: string;
  url: string;
  expiry: string | null;
  tiers: { price: Money | null; games: { itad: string; title: string }[] }[];
};

/** Regionale Shop-Ableger ("GamesPlanet US") nur fürs eigene Land – fremde Keys sind oft regionsgesperrt. */
const otherRegion = (shop: string, country: string) => {
  const m = / ([A-Z]{2})$/.exec(shop);
  return !!m && m[1] !== country;
};

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

type GameInfo = {
  id: string;
  title: string;
  steam_appid: number | null;
  itad_id: string | null;
  itad_checked_at: string | null;
  capsule_image: string | null;
  header_image: string | null;
} & PlatformInfo;

/** ITAD-IDs für Spiele mit Steam-AppID nachschlagen (einmalig pro Spiel). */
async function ensureItadIds(games: GameInfo[]) {
  const todo = games.filter((g) => !g.itad_checked_at && g.steam_appid);
  if (!todo.length) return;
  const map = await lookupSteamApps(todo.map((g) => g.steam_appid!));
  const now = new Date().toISOString();
  await mapLimit(todo, 8, async (g) => {
    g.itad_id = map.get(g.steam_appid!) ?? null;
    g.itad_checked_at = now;
    await db().from("games").update({ itad_id: g.itad_id, itad_checked_at: now }).eq("id", g.id);
  });
}

async function loadPriceRows(ids: string[]) {
  return selectInChunks<PriceRow>(
    ids,
    (chunk) => db().from("game_prices").select("game_id, deals, history_low, bundles, fetched_at, bundles_fetched_at").in("game_id", chunk) as unknown as PromiseLike<{ data: PriceRow[] | null; error: { message: string } | null }>,
    "game_prices.select",
  );
}

/** Preise auffrischen, wenn älter als 6 h – ein ITAD-Aufruf für bis zu 200 Spiele. */
async function refreshPrices(games: GameInfo[], rows: Map<string, PriceRow>, country: string) {
  const stale = games.filter((g) => g.itad_id && (!rows.has(g.id) || Date.now() - Date.parse(rows.get(g.id)!.fetched_at) > PRICE_TTL));
  if (!stale.length) return;
  const prices = await getPrices(stale.map((g) => g.itad_id!), country);
  const byItad = new Map(prices.map((p) => [p.id, p]));
  const now = new Date().toISOString();
  const upserts = stale.map((g) => {
    const p = byItad.get(g.itad_id!);
    const all: Deal[] = (p?.deals ?? [])
      .filter((d) => !otherRegion(d.shop.name, country))
      .map((d) => ({ shop: d.shop.name, shopId: d.shop.id, price: d.price, regular: d.regular, cut: d.cut, url: d.url, expiry: d.expiry, voucher: d.voucher }))
      .sort((a, b) => a.price.amount - b.price.amount);
    // Die günstigsten paar + immer Steam als Vergleich
    const deals = all.filter((d, i) => i < 5 || d.shopId === STEAM_SHOP_ID);
    const row: PriceRow = {
      game_id: g.id,
      deals,
      history_low: p?.historyLow ? { all: p.historyLow.all, y1: p.historyLow.y1 } : null,
      bundles: rows.get(g.id)?.bundles ?? null,
      fetched_at: now,
      bundles_fetched_at: rows.get(g.id)?.bundles_fetched_at ?? null,
    };
    rows.set(g.id, row);
    return { ...row, country };
  });
  must(await db().from("game_prices").upsert(upserts), "game_prices.upsert");
}

/** Aktive Bundles für die bestpassenden Spiele (eine Anfrage pro Spiel, 12 h gecacht). */
async function refreshBundles(games: GameInfo[], rows: Map<string, PriceRow>, country: string) {
  const stale = games.filter((g) => {
    const r = rows.get(g.id);
    return g.itad_id && r && (!r.bundles_fetched_at || Date.now() - Date.parse(r.bundles_fetched_at) > BUNDLE_TTL);
  });
  const now = new Date().toISOString();
  await mapLimit(stale, 4, async (g) => {
    let bundles: ItadBundle[] = [];
    try {
      bundles = await getBundles(g.itad_id!, country);
    } catch (e) {
      console.warn("Bundles", g.title, e);
      return;
    }
    const stored: StoredBundle[] = bundles
      .filter((b) => !b.isMature && (!b.expiry || Date.parse(b.expiry) > Date.now()))
      .map((b) => ({
        id: b.id,
        title: b.title,
        shop: b.page.name,
        url: b.url,
        expiry: b.expiry,
        tiers: b.tiers.map((t) => ({ price: t.price, games: t.games.map((x) => ({ itad: x.id, title: x.title })) })),
      }));
    const r = rows.get(g.id)!;
    r.bundles = stored;
    r.bundles_fetched_at = now;
    await db().from("game_prices").update({ bundles: stored, bundles_fetched_at: now }).eq("game_id", g.id);
  });
}

export type DealItem = {
  game: { id: string; title: string; capsule_image: string | null; header_image: string | null; steam_appid: number | null } & PlatformInfo;
  fit: number | null;
  reach: Reach;
  modeKey: string | null;
  wishlisted: boolean;
  recommended: boolean;
  best: Deal;
  steam: Deal | null;
  historyLow: Money | null;
  atLow: boolean;
  nearLow: boolean;
  score: number;
};

export type BundleItem = {
  id: number;
  title: string;
  shop: string;
  url: string;
  expiry: string | null;
  price: Money;
  matched: { id: string; title: string; fit: number | null; regular: number | null }[];
  value: number;
};

export type DealsResult = {
  configured: boolean;
  deals: DealItem[];
  bundles: BundleItem[];
  familyCount: number;
  checked: number;
  updatedAt: string | null;
  error?: string;
};

/**
 * Passende Angebote: Wunschliste + aktuelle Empfehlungen + bestpassende Spiele aus dem Katalog,
 * nur was du noch nicht hast (und nicht über die Steam-Familie spielen kannst).
 * Sortiert nach Passung × Rabatt, mit Bonus für Allzeittief.
 */
const RESULT_TTL = 30 * 60 * 1000;

/** Zwischengespeichertes Ergebnis (30 min) – sonst neu berechnen. */
export async function findDeals(user: UserRow, opts: { fresh?: boolean } = {}): Promise<DealsResult> {
  if (!itadConfigured()) return { configured: false, deals: [], bundles: [], familyCount: 0, checked: 0, updatedAt: null };
  if (!opts.fresh) {
    const { data } = await db().from("user_deals").select("result, computed_at").eq("user_id", user.id).maybeSingle();
    const cached = data as { result: DealsResult; computed_at: string } | null;
    if (cached && Date.now() - Date.parse(cached.computed_at) < RESULT_TTL) return cached.result;
  }
  const result = await computeDeals(user);
  if (!result.error) await db().from("user_deals").upsert({ user_id: user.id, result, computed_at: new Date().toISOString() });
  return result;
}

async function computeDeals(user: UserRow): Promise<DealsResult> {
  const country = env().STEAM_COUNTRY;

  const lib = await fetchAll<{ game_id: string; owned: boolean; manual: boolean; wishlisted: boolean }>(
    (from, to) => db().from("user_games").select("game_id, owned, manual, wishlisted").eq("user_id", user.id).order("game_id").range(from, to),
    "deals.library",
  );
  const owned = new Set(lib.filter((r) => r.owned || r.manual).map((r) => r.game_id));
  const wishlist = new Set(lib.filter((r) => r.wishlisted && !r.owned).map((r) => r.game_id));
  const family = new Set(
    (await fetchAll<{ game_id: string }>((from, to) => db().rpc("family_library", { p_user: user.id }).range(from, to), "deals.family")).map((f) => f.game_id),
  );
  const { data: recRows } = await db()
    .from("recommendations")
    .select("game_id")
    .eq("user_id", user.id)
    .gte("created_at", new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString());
  const recommended = new Set(((recRows ?? []) as { game_id: string }[]).map((r) => r.game_id));
  // Abgelehnte ("Eher nicht") und schon gespielte Empfehlungen nie als Deal zeigen – außer sie stehen auf der Wunschliste
  const { data: fbRows } = await db().from("rec_feedback").select("game_id").eq("user_id", user.id).neq("verdict", "interested");
  const rejected = new Set(((fbRows ?? []) as { game_id: string }[]).map((r) => r.game_id).filter((id) => !wishlist.has(id)));

  // Passung (0–100 = Perzentil im Katalog) mit demselben Ranking wie die Empfehlungen
  const fit = new Map<string, number>();
  const modeOf = new Map<string, string | null>();
  const tp = await getTasteProfile(user.id);
  if (tp) {
    const pool = (
      await fetchAll<{ id: string; essence_embedding: unknown; review_positive: number | null; review_negative: number | null }>(
        (from, to) =>
          db()
            .from("games")
            .select("id, essence_embedding, review_positive, review_negative")
            .not("essence_embedding", "is", null)
            .eq("is_software", false)
            .order("id")
            .range(from, to),
        "deals.pool",
      )
    )
      .filter((g) => !owned.has(g.id))
      .map((g) => ({ id: g.id, vector: parsePgVector(g.essence_embedding)!, quality: wilson(g.review_positive, g.review_negative) }));
    const intents = await loadIntents(user.id);
    const scored = (await buildPersonalScorer(user.id, tp.profile, intents, null))(pool);
    const sorted = [...pool].sort((a, b) => scored.get(a.id)!.score - scored.get(b.id)!.score);
    sorted.forEach((g, i) => fit.set(g.id, Math.round((i / Math.max(1, sorted.length - 1)) * 100)));
    for (const g of pool) modeOf.set(g.id, scoreCandidate(g.vector, intents, null).modeKey);
  }

  const topCatalog = [...fit.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_CATALOG).map(([id]) => id);
  const wanted = [...new Set([...wishlist, ...recommended, ...topCatalog])].filter((id) => !owned.has(id) && !rejected.has(id));
  const familyCount = wanted.filter((id) => family.has(id)).length;
  const candidateIds = wanted.filter((id) => !family.has(id)).slice(0, 300);

  // Nur, was auf Haupt- oder Ausweich-Plattformen der Person läuft
  const prefs = prefsOf(user);
  await ensureGfnFresh().catch((e) => console.warn("GeForce NOW", e));
  await refreshMissingAssets(candidateIds).catch((e) => console.warn("Assets", e));
  const games = (
    await selectInChunks<GameInfo>(
      candidateIds,
      (chunk) =>
        db().from("games").select(`id, title, steam_appid, itad_id, itad_checked_at, capsule_image, header_image, ${PLATFORM_COLUMNS}`).in("id", chunk) as unknown as PromiseLike<{
          data: GameInfo[] | null;
          error: { message: string } | null;
        }>,
      "deals.games",
    )
  ).filter((g) => reachOf(g, prefs) !== "none");

  let error: string | undefined;
  const rows = new Map((await loadPriceRows(candidateIds)).map((r) => [r.game_id, r]));
  try {
    await ensureItadIds(games);
    await refreshPrices(games, rows, country);
    const byFit = [...games].filter((g) => g.itad_id).sort((a, b) => (fit.get(b.id) ?? (wishlist.has(b.id) ? 60 : 0)) - (fit.get(a.id) ?? (wishlist.has(a.id) ? 60 : 0)));
    await refreshBundles(byFit.slice(0, BUNDLE_LOOKUPS), rows, country);
  } catch (e) {
    console.error("Deals: IsThereAnyDeal-Fehler", e instanceof Error ? e.message : e);
    error = itadErrorMessage(e);
  }

  // Einzel-Angebote
  const deals: DealItem[] = [];
  for (const g of games) {
    const r = rows.get(g.id);
    const best = r?.deals[0];
    if (!r || !best || best.cut <= 0) continue;
    const f = fit.get(g.id) ?? null;
    const low = r.history_low?.all ?? null;
    const atLow = !!low && best.price.amount <= low.amount + 0.01;
    const nearLow = !atLow && !!r.history_low?.y1 && best.price.amount <= r.history_low.y1.amount + 0.01;
    const effectiveFit = f ?? (wishlist.has(g.id) ? 60 : 40);
    const score =
      Math.pow(effectiveFit / 100, 1.5) *
      (0.4 + 0.6 * (best.cut / 100)) *
      (atLow ? 1.2 : nearLow ? 1.08 : 1) *
      (wishlist.has(g.id) ? 1.12 : 1) *
      (recommended.has(g.id) ? 1.06 : 1) *
      (reachOf(g, prefs) === "fallback" ? FALLBACK_FACTOR : 1);
    deals.push({
      game: {
        id: g.id,
        title: g.title,
        capsule_image: g.capsule_image,
        header_image: g.header_image,
        steam_appid: g.steam_appid,
        plat_windows: g.plat_windows,
        plat_mac: g.plat_mac,
        plat_linux: g.plat_linux,
        deck_compat: g.deck_compat,
        gfn_store: g.gfn_store,
        platforms_fetched_at: g.platforms_fetched_at,
      },
      fit: f,
      reach: reachOf(g, prefs),
      modeKey: modeOf.get(g.id) ?? null,
      wishlisted: wishlist.has(g.id),
      recommended: recommended.has(g.id),
      best,
      steam: r.deals.find((d) => d.shopId === STEAM_SHOP_ID) ?? null,
      historyLow: low,
      atLow,
      nearLow,
      score,
    });
  }
  deals.sort((a, b) => b.score - a.score);

  // Bundles mit mindestens zwei Spielen, die zu dir passen
  const byItad = new Map(games.filter((g) => g.itad_id).map((g) => [g.itad_id!, g]));
  const seen = new Map<number, StoredBundle>();
  for (const r of rows.values()) for (const b of r.bundles ?? []) seen.set(b.id, b);
  const bundles: BundleItem[] = [];
  for (const b of seen.values()) {
    let neededTier = -1;
    const matched: BundleItem["matched"] = [];
    b.tiers.forEach((t, ti) =>
      t.games.forEach((x) => {
        const g = byItad.get(x.itad);
        if (!g || matched.some((m) => m.id === g.id)) return;
        neededTier = Math.max(neededTier, ti);
        const pr = rows.get(g.id)?.deals;
        const regular = pr?.find((d) => d.shopId === STEAM_SHOP_ID)?.regular.amount ?? pr?.[0]?.regular.amount ?? null;
        matched.push({ id: g.id, title: g.title, fit: fit.get(g.id) ?? null, regular });
      }),
    );
    // Stufen sind kumulativ: Wer eine Stufe kauft, bekommt alle darunter
    const price = neededTier >= 0 ? b.tiers[neededTier].price : null;
    if (matched.length < 2 || !price) continue;
    const value = matched.reduce((s, m) => s + (m.regular ?? 0), 0);
    if (value <= price.amount) continue;
    bundles.push({ id: b.id, title: b.title, shop: b.shop, url: b.url, expiry: b.expiry, price, matched, value });
  }
  bundles.sort((a, b) => {
    const q = (x: BundleItem) => (x.value / x.price.amount) * (x.matched.reduce((s, m) => s + (m.fit ?? 50), 0) / x.matched.length);
    return q(b) - q(a);
  });

  const updatedAt = [...rows.values()].reduce<string | null>((max, r) => (!max || r.fetched_at > max ? r.fetched_at : max), null);
  return { configured: true, deals: deals.slice(0, 80), bundles: bundles.slice(0, 8), familyCount, checked: games.filter((g) => g.itad_id).length, updatedAt, error };
}

function itadErrorMessage(e: unknown): string {
  const stale = " Angezeigt werden zwischengespeicherte Preise, falls vorhanden.";
  if (e instanceof ItadError && (e.status === 401 || e.status === 403)) {
    return `IsThereAnyDeal lehnt den API-Key ab (${e.status}). Prüf ITAD_API_KEY in Vercel: Es muss der „API Key“ deiner App sein (nicht Client-ID oder Secret), ohne Anführungszeichen – danach neu deployen.${stale}`;
  }
  if (e instanceof ItadError && e.status === 429) return `IsThereAnyDeal: zu viele Anfragen, bitte in ein paar Minuten nochmal.${stale}`;
  if (e instanceof ItadError) return `IsThereAnyDeal antwortet mit Fehler ${e.status}.${stale}`;
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return `IsThereAnyDeal antwortet gerade nicht (Zeitüberschreitung).${stale}`;
  return `Preise konnten nicht aktualisiert werden: ${e instanceof Error ? e.message.slice(0, 160) : "unbekannter Fehler"}.${stale}`;
}

/** "Bei Instant Gaming suchen" – öffnet die Suche im Browser der Person (kein Scraping), mit Empfehlungscode. */
export function instantGamingSearchUrl(title: string): string {
  const q = title.replace(/[®™©]/g, "").trim();
  const ref = env().INSTANT_GAMING_REF.trim();
  return `https://www.instant-gaming.com/en/search/?${new URLSearchParams({ q, ...(ref ? { igr: ref } : {}) })}`;
}
