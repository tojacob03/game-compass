import "server-only";
import { db, fetchAll, must } from "./db";
import { getAppNames, normalizeTitle, searchStore } from "./steam";

/**
 * Spielelisten importieren (CSV, eingefügte Liste): Jede Zeile ist eine Steam-AppID, ein Store-Link oder ein Titel.
 * Titel werden zuerst im eigenen Katalog gesucht, dann im Steam-Store (nur exakte bzw. eindeutige Treffer).
 */
export const MAX_IMPORT_ROWS = 400;

export type ImportEntry = { raw: string; appid: number | null; title: string | null };

const APPID_HEADERS = ["appid", "app_id", "app id", "steam_appid", "steamappid", "steam id", "id"];
const TITLE_HEADERS = ["title", "titel", "name", "game", "spiel", "game name", "spielname"];

function splitLine(line: string, sep: string): string[] {
  // CSV mit Anführungszeichen ("Titel, mit Komma")
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === sep && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

const appidFrom = (s: string): number | null => {
  const url = /store\.steampowered\.com\/app\/(\d+)|steamdb\.info\/app\/(\d+)/.exec(s);
  if (url) return Number(url[1] ?? url[2]);
  return /^\d{1,8}$/.test(s.trim()) ? Number(s.trim()) : null;
};

export function parseGameList(text: string): ImportEntry[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  // Trennzeichen: das in den ersten Zeilen am häufigsten vorkommende (Inhalte in Anführungszeichen zählen nicht)
  const sample = lines.slice(0, 10).map((l) => l.replace(/"[^"]*"/g, ""));
  const sep = [",", ";", "\t", "|"]
    .map((c) => ({ c, n: sample.filter((l) => l.includes(c)).length }))
    .sort((a, b) => b.n - a.n)[0];
  const separator = sep.n >= Math.ceil(sample.length / 2) ? sep.c : "\u0000";
  const head = splitLine(lines[0], separator).map((h) => h.toLowerCase().replace(/^"|"$/g, ""));
  let appidCol = head.findIndex((h) => APPID_HEADERS.includes(h));
  let titleCol = head.findIndex((h) => TITLE_HEADERS.includes(h));
  const hasHeader = appidCol >= 0 || titleCol >= 0;
  const rows = (hasHeader ? lines.slice(1) : lines).map((l) => splitLine(l, separator));
  if (!hasHeader) {
    // Ohne Kopfzeile: Spalte mit überwiegend Zahlen = AppID, erste Textspalte = Titel
    const cols = Math.max(...rows.slice(0, 20).map((r) => r.length));
    for (let c = 0; c < cols; c++) {
      const vals = rows.slice(0, 20).map((r) => r[c] ?? "").filter(Boolean);
      // Jahreszahlen-Spalten sind keine AppIDs
      if (vals.length && vals.every((v) => /^(19[7-9]\d|20[0-3]\d)$/.test(v))) continue;
      const numeric = vals.filter((v) => appidFrom(v) !== null).length;
      if (appidCol < 0 && numeric >= vals.length * 0.8 && vals.length) appidCol = c;
      else if (titleCol < 0 && numeric < vals.length * 0.5) titleCol = c;
    }
  }
  return rows
    .map((r) => {
      const a = appidCol >= 0 ? appidFrom(r[appidCol] ?? "") : null;
      const anyUrl = r.map((c) => (/\/app\/\d+/.test(c) ? appidFrom(c) : null)).find((x) => x !== null) ?? null;
      let title = titleCol >= 0 ? (r[titleCol] ?? "").replace(/^"|"$/g, "").trim() || null : null;
      // Steht in der Titel-Spalte eine reine AppID oder ein Store-Link, ist es kein Titel
      const titleAsId = title ? appidFrom(title) : null;
      if (titleAsId !== null) title = null;
      return { raw: r.join(" · ").slice(0, 200), appid: a ?? anyUrl ?? titleAsId, title };
    })
    .filter((e) => e.appid || e.title)
    .slice(0, MAX_IMPORT_ROWS);
}

async function mapLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

/** Spiele zu Steam-AppIDs anlegen (falls neu) – ein Upsert für alle. */
export async function ensureSteamGames(items: { appid: number; title: string }[]): Promise<Map<number, string>> {
  const uniq = [...new Map(items.map((i) => [i.appid, i])).values()];
  const out = new Map<number, string>();
  for (let i = 0; i < uniq.length; i += 300) {
    const chunk = uniq.slice(i, i + 300);
    must(
      await db().from("games").upsert(chunk.map((c) => ({ steam_appid: c.appid, title: c.title })), { onConflict: "steam_appid", ignoreDuplicates: true }),
      "games.bulk_upsert",
    );
    const rows = must(await db().from("games").select("id, steam_appid").in("steam_appid", chunk.map((c) => c.appid)), "games.bulk_ids") as {
      id: string;
      steam_appid: number;
    }[];
    for (const r of rows) out.set(r.steam_appid, r.id);
  }
  return out;
}

export type ImportResult = { gameIds: string[]; matched: { raw: string; title: string }[]; unresolved: string[] };

export async function resolveEntries(entries: ImportEntry[], deadline = Date.now() + 40_000): Promise<ImportResult> {
  const matched: ImportResult["matched"] = [];
  const unresolved: string[] = [];
  const byAppid = new Map<number, { raw: string; title: string | null }>();
  const byTitle: ImportEntry[] = [];
  for (const e of entries) {
    if (e.appid) byAppid.set(e.appid, { raw: e.raw, title: e.title });
    else byTitle.push(e);
  }

  // Titel zuerst im vorhandenen Katalog suchen (schnell, keine externe Anfrage)
  const catalog = await fetchAll<{ id: string; title: string; steam_appid: number | null }>(
    (from, to) => db().from("games").select("id, title, steam_appid").order("id").range(from, to),
    "import.catalog",
  );
  const local = new Map(catalog.map((g) => [normalizeTitle(g.title), g]));
  const gameIds = new Set<string>();
  const remaining: ImportEntry[] = [];
  for (const e of byTitle) {
    const hit = local.get(normalizeTitle(e.title!));
    if (hit) {
      gameIds.add(hit.id);
      matched.push({ raw: e.raw, title: hit.title });
    } else remaining.push(e);
  }

  // Unbekannte Titel im Steam-Store suchen – nur eindeutige Treffer übernehmen
  await mapLimit(remaining, 3, async (e) => {
    if (Date.now() > deadline) return void unresolved.push(e.raw);
    try {
      const want = normalizeTitle(e.title!);
      const items = await searchStore(e.title!);
      const hit = items.find((i) => normalizeTitle(i.name) === want) ?? (items.length === 1 ? items[0] : undefined);
      if (hit) byAppid.set(hit.id, { raw: e.raw, title: hit.name });
      else unresolved.push(e.raw);
    } catch {
      unresolved.push(e.raw);
    }
  });

  // AppIDs: echte Namen holen (Katalog, sonst Steam) – nie den Titel aus der Datei übernehmen – und gegen
  // einen mitgelieferten Titel prüfen (z. B. Jahreszahl als AppID erwischt)
  const known = new Map(catalog.filter((g) => g.steam_appid).map((g) => [g.steam_appid!, g]));
  const appids = [...byAppid.keys()];
  const missingNames = appids.filter((a) => !known.has(a));
  const names = missingNames.length ? await getAppNames(missingNames) : new Map<number, string>();
  const realName = (a: number) => known.get(a)?.title ?? names.get(a) ?? null;
  const sameGame = (given: string, real: string) => {
    const g = normalizeTitle(given);
    const n = normalizeTitle(real);
    return g === n || n.startsWith(g) || g.startsWith(n);
  };
  const toCreate: { appid: number; title: string }[] = [];
  const retry: { raw: string; title: string | null }[] = [];
  for (const a of appids) {
    const e = byAppid.get(a)!;
    const real = realName(a);
    if (real && (!e.title || sameGame(e.title, real))) toCreate.push({ appid: a, title: real });
    else retry.push(e);
  }
  // Passt die AppID nicht zum Titel, stattdessen nach dem Titel suchen
  for (const e of retry) {
    const hit = e.title ? local.get(normalizeTitle(e.title)) : undefined;
    if (hit) {
      gameIds.add(hit.id);
      matched.push({ raw: e.raw, title: hit.title });
      continue;
    }
    try {
      const want = normalizeTitle(e.title ?? "");
      const s = e.title ? (await searchStore(e.title)).find((i) => normalizeTitle(i.name) === want) : undefined;
      if (s) toCreate.push({ appid: s.id, title: s.name });
      else unresolved.push(e.raw);
    } catch {
      unresolved.push(e.raw);
    }
  }
  const ids = await ensureSteamGames(toCreate);
  for (const t of toCreate) {
    const id = ids.get(t.appid);
    if (!id || gameIds.has(id)) continue;
    gameIds.add(id);
    matched.push({ raw: byAppid.get(t.appid)?.raw ?? t.title, title: t.title });
  }
  return { gameIds: [...gameIds], matched, unresolved };
}
