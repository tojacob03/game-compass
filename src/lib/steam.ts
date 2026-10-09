import "server-only";
import { env } from "./env";

const API = "https://api.steampowered.com";
const STORE = "https://store.steampowered.com";
const OPENID = "https://steamcommunity.com/openid/login";

async function getJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(init?.timeoutMs ?? 15000),
    headers: { "user-agent": "GameCompass/0.1 (private hobby project)", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Steam ${res.status} für ${url.replace(/key=[^&]+/, "key=***")}`);
  return (await res.json()) as T;
}

export function steamHeaderImage(appid: number) {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
}

export function steamStoreUrl(appid: number) {
  return `${STORE}/app/${appid}`;
}

// ---------------------------------------------------------------------------
// OpenID-Login
// ---------------------------------------------------------------------------

export function steamLoginUrl(returnTo: string, realm: string) {
  const p = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo,
    "openid.realm": realm,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${OPENID}?${p.toString()}`;
}

/**
 * Prüft die OpenID-Antwort direkt bei Steam (check_authentication).
 * Gibt die SteamID64 zurück oder null, wenn irgendetwas nicht stimmt.
 */
export async function verifySteamLogin(params: URLSearchParams, expectedReturnTo: string): Promise<string | null> {
  if (params.get("openid.mode") !== "id_res") return null;
  if (params.get("openid.op_endpoint") !== OPENID) return null;
  if (params.get("openid.return_to") !== expectedReturnTo) return null;

  const claimed = params.get("openid.claimed_id") ?? "";
  const match = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed);
  if (!match) return null;
  if (params.get("openid.identity") !== claimed) return null;

  const body = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith("openid.")) body.set(k, v);
  body.set("openid.mode", "check_authentication");

  const res = await fetch(OPENID, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!/^is_valid\s*:\s*true$/m.test(text)) return null;
  return match[1];
}

// ---------------------------------------------------------------------------
// Web API (mit Key)
// ---------------------------------------------------------------------------

export type PlayerSummary = { steamid: string; personaname: string; avatarfull: string; communityvisibilitystate: number };

export async function getPlayerSummary(steamId: string): Promise<PlayerSummary | null> {
  const data = await getJson<{ response: { players: PlayerSummary[] } }>(
    `${API}/ISteamUser/GetPlayerSummaries/v2/?key=${env().STEAM_API_KEY}&steamids=${steamId}`,
  );
  return data.response.players[0] ?? null;
}

/**
 * Steam-Profil aus Eingabe auflösen: SteamID64, Profil-Link (/profiles/… oder /id/…) oder Profilname.
 * null = nicht gefunden.
 */
export async function resolveSteamId(input: string): Promise<string | null> {
  const v = input.trim();
  const direct = /(?:^|\/profiles\/)(\d{17})(?:\/|$)/.exec(v);
  if (direct) return direct[1];
  const vanity = /\/id\/([^/?#]+)/.exec(v)?.[1] ?? (/^[A-Za-z0-9_-]{2,32}$/.test(v) ? v : null);
  if (!vanity) return null;
  const data = await getJson<{ response: { success: number; steamid?: string } }>(
    `${API}/ISteamUser/ResolveVanityURL/v1/?key=${env().STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanity)}`,
  );
  return data.response.success === 1 ? (data.response.steamid ?? null) : null;
}

export type OwnedGame = { appid: number; name: string; playtime_forever: number; rtime_last_played?: number };

/** null = Profil/Spieldetails privat */
export async function getOwnedGames(steamId: string): Promise<OwnedGame[] | null> {
  const data = await getJson<{ response: { game_count?: number; games?: OwnedGame[] } }>(
    `${API}/IPlayerService/GetOwnedGames/v1/?key=${env().STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`,
  );
  if (data.response.game_count === undefined) return null;
  return data.response.games ?? [];
}

/** Öffentliche Wunschliste (kein Key nötig). Leer, wenn privat. */
export async function getWishlist(steamId: string): Promise<{ appid: number; priority: number }[]> {
  const data = await getJson<{ response: { items?: { appid: number; priority: number }[] } }>(
    `${API}/IWishlistService/GetWishlist/v1/?steamid=${steamId}`,
  );
  return data.response.items ?? [];
}

/** Namen für viele AppIDs auf einmal (öffentlicher Store-Endpoint). */
export async function getAppNames(appids: number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  for (let i = 0; i < appids.length; i += 100) {
    const chunk = appids.slice(i, i + 100);
    const input = {
      ids: chunk.map((appid) => ({ appid })),
      context: { language: "english", country_code: env().STEAM_COUNTRY },
      data_request: { include_basic_info: false },
    };
    try {
      const data = await getJson<{ response: { store_items?: { appid?: number; id: number; name?: string }[] } }>(
        `${API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
      );
      for (const it of data.response.store_items ?? []) if (it.name) names.set(it.appid ?? it.id, it.name);
    } catch (e) {
      console.warn("GetItems fehlgeschlagen", e);
    }
  }
  return names;
}

export type SteamAssets = {
  appid: number;
  header: string | null;
  capsule: string | null;
  hero: string | null;
  // Plattformen (fehlen, wenn Steam keine Daten liefert)
  windows?: boolean;
  mac?: boolean;
  linux?: boolean;
  deck?: number;
};

/**
 * Echte Bild-URLs aus dem Store (bis zu 100 Spiele pro Aufruf). Neuere Spiele haben Hash-Pfade –
 * die früher übliche /apps/{id}/header.jpg-URL existiert dort nicht mehr.
 */
export async function getAssets(appids: number[]): Promise<SteamAssets[]> {
  const out: SteamAssets[] = [];
  const base = "https://shared.akamai.steamstatic.com/store_item_assets/";
  for (let i = 0; i < appids.length; i += 100) {
    const input = {
      ids: appids.slice(i, i + 100).map((appid) => ({ appid })),
      context: { language: "english", country_code: env().STEAM_COUNTRY },
      data_request: { include_assets: true, include_platforms: true },
    };
    type Item = {
      appid?: number;
      id: number;
      assets?: { asset_url_format?: string; header?: string; library_capsule?: string; library_hero?: string; main_capsule?: string };
      platforms?: { windows?: boolean; mac?: boolean; steamos_linux?: boolean; steam_deck_compat_category?: number };
    };
    try {
      const data = await getJson<{ response: { store_items?: Item[] } }>(
        `${API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
      );
      for (const it of data.response.store_items ?? []) {
        const a = it.assets;
        const url = (file?: string) => (a?.asset_url_format && file ? base + a.asset_url_format.replace("${FILENAME}", file) : null);
        const p = it.platforms;
        out.push({
          appid: it.appid ?? it.id,
          header: url(a?.header) ?? url(a?.main_capsule),
          capsule: url(a?.library_capsule),
          hero: url(a?.library_hero),
          ...(p ? { windows: !!p.windows, mac: !!p.mac, linux: !!p.steamos_linux, deck: p.steam_deck_compat_category ?? 0 } : {}),
        });
      }
    } catch (e) {
      console.warn("Steam-Assets konnten nicht geladen werden", e);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Store-Daten, Reviews, Suche (öffentlich)
// ---------------------------------------------------------------------------

export type AppDetails = {
  name: string;
  type: string;
  short_description?: string;
  about_the_game?: string;
  genres?: { description: string }[];
  categories?: { description: string }[];
  developers?: string[];
  release_date?: { date?: string };
  header_image?: string;
};

export async function getAppDetails(appid: number): Promise<AppDetails | null> {
  const data = await getJson<Record<string, { success: boolean; data?: AppDetails }>>(
    `${STORE}/api/appdetails?appids=${appid}&l=english&cc=${env().STEAM_COUNTRY}`,
  );
  const entry = data[String(appid)];
  return entry?.success && entry.data ? entry.data : null;
}

export type SteamSpyApp = { positive: number; negative: number; tags: Record<string, number> | [] };

export async function getSteamSpy(appid: number): Promise<SteamSpyApp | null> {
  try {
    return await getJson<SteamSpyApp>(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`);
  } catch {
    return null;
  }
}

export type SteamSpyTagEntry = { appid: number; name: string; positive: number; negative: number };

/** Alle Spiele mit einem Steam-Tag (groß, aber nützlich als Kandidaten-Pool). */
export async function getSteamSpyTag(tag: string): Promise<SteamSpyTagEntry[]> {
  try {
    const data = await getJson<Record<string, SteamSpyTagEntry>>(
      `https://steamspy.com/api.php?request=tag&tag=${encodeURIComponent(tag)}`,
      { timeoutMs: 25000 },
    );
    return Object.values(data);
  } catch {
    return [];
  }
}

export type SteamReview = { text: string; votedUp: boolean; playtimeHours: number; helpful: number };

export async function getReviews(appid: number, type: "positive" | "negative", count: number): Promise<SteamReview[]> {
  type Raw = {
    reviews?: {
      review: string;
      voted_up: boolean;
      votes_up: number;
      author: { playtime_forever: number; playtime_at_review?: number };
    }[];
  };
  const url = `${STORE}/appreviews/${appid}?json=1&language=english&filter=all&review_type=${type}&purchase_type=all&num_per_page=40`;
  try {
    const data = await getJson<Raw>(url);
    return (data.reviews ?? [])
      .filter((r) => r.review.trim().length >= 120)
      .slice(0, count)
      .map((r) => ({
        text: r.review.replace(/\[\/?[a-z0-9*]+(=[^\]]*)?\]/gi, " ").replace(/\s+/g, " ").trim().slice(0, 1200),
        votedUp: r.voted_up,
        playtimeHours: Math.round((r.author.playtime_at_review ?? r.author.playtime_forever) / 60),
        helpful: r.votes_up,
      }));
  } catch {
    return [];
  }
}

export type StoreSearchItem = { id: number; name: string; type: string; metascore?: string };

export async function searchStore(term: string): Promise<StoreSearchItem[]> {
  const data = await getJson<{ items?: StoreSearchItem[] }>(
    `${STORE}/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=${env().STEAM_COUNTRY}`,
  );
  return (data.items ?? []).filter((i) => i.type === "app");
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h\d|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Normalisierter Titel für Vergleiche ("The Witcher® 3: Wild Hunt" -> "witcher 3 wild hunt"). */
export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim();
}
