import "server-only";
import { env } from "./env";

/**
 * IsThereAnyDeal-API: Preise aller offiziellen Shops (Steam, GOG, Epic, Humble, Fanatical, GMG …),
 * Allzeittiefs und Bundles. Keine Grau-Markt-Händler. https://docs.isthereanydeal.com/
 */
const BASE = "https://api.isthereanydeal.com";
export const STEAM_SHOP_ID = 61;

export type Money = { amount: number; amountInt: number; currency: string };
export type ItadDeal = {
  shop: { id: number; name: string };
  price: Money;
  regular: Money;
  cut: number;
  voucher: string | null;
  storeLow: Money | null;
  url: string;
  expiry: string | null;
};
export type ItadPrices = { id: string; historyLow: { all: Money | null; y1: Money | null; m3: Money | null } | null; deals: ItadDeal[] };
export type ItadBundle = {
  id: number;
  title: string;
  page: { id: number; name: string; shopId: number | null };
  url: string;
  details: string;
  isMature: boolean;
  publish: string;
  expiry: string | null;
  tiers: { price: Money | null; games: { id: string; title: string; type: string | null }[] }[];
};

export const itadConfigured = () => !!env().ITAD_API_KEY;

async function itad<T>(path: string, init: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const key = env().ITAD_API_KEY;
  if (!key) throw new Error("ITAD_API_KEY fehlt");
  const url = `${BASE}${path}${init.query ? `?${new URLSearchParams(init.query)}` : ""}`;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { "ITAD-API-Key": key, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`IsThereAnyDeal ${res.status} für ${path}`);
  return (await res.json()) as T;
}

/** Steam-AppIDs -> ITAD-Spiel-IDs (bis zu 200 pro Aufruf). */
export async function lookupSteamApps(appids: number[]): Promise<Map<number, string | null>> {
  const out = new Map<number, string | null>();
  for (let i = 0; i < appids.length; i += 200) {
    const chunk = appids.slice(i, i + 200);
    const res = await itad<Record<string, string | null>>(`/lookup/id/shop/${STEAM_SHOP_ID}/v1`, { method: "POST", body: chunk.map((a) => `app/${a}`) });
    for (const a of chunk) out.set(a, res[`app/${a}`] ?? null);
  }
  return out;
}

/** Aktuelle Preise + Allzeittiefs (bis zu 200 Spiele pro Aufruf). */
export async function getPrices(ids: string[], country: string): Promise<ItadPrices[]> {
  const out: ItadPrices[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    out.push(
      ...(await itad<ItadPrices[]>("/games/prices/v3", {
        method: "POST",
        query: { country, vouchers: "true", capacity: "8" },
        body: ids.slice(i, i + 200),
      })),
    );
  }
  return out;
}

/** Aktive Bundles, die ein Spiel enthalten. */
export function getBundles(id: string, country: string): Promise<ItadBundle[]> {
  return itad<ItadBundle[]>("/games/bundles/v2", { query: { id, country, expired: "false" } });
}
