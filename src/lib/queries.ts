import "server-only";
import { db, must } from "./db";
import { GAME_LIST_COLUMNS, type GameListItem } from "./types";

export async function countUserGames(userId: string, filter: "owned" | "wishlisted" | "manual" | "rated") {
  let q = db().from("user_games").select("game_id", { count: "exact", head: true }).eq("user_id", userId);
  q = filter === "rated" ? q.not("score", "is", null) : q.eq(filter, true);
  const { count } = await q;
  return count ?? 0;
}

export async function queueCount(userId: string) {
  const { count } = await db().from("analysis_queue").select("game_id", { count: "exact", head: true }).eq("requested_by", userId);
  return count ?? 0;
}

export type LatestRec = {
  id: string;
  rank: number;
  fit: number;
  headline: string;
  why: string;
  risks: string | null;
  matched_drivers: string[];
  is_wildcard: boolean;
  via_family: boolean;
  mode_key: string | null;
  created_at: string;
  games: GameListItem;
};

/** mode: undefined = neuester Lauf egal welcher Modus, null = "Mix", sonst Modus-Schlüssel. */
export async function latestRecommendations(userId: string, mode?: string | null): Promise<LatestRec[]> {
  let q = db().from("recommendation_runs").select("id").eq("user_id", userId).eq("status", "ready");
  if (mode === null) q = q.is("mode_key", null);
  else if (mode) q = q.eq("mode_key", mode);
  const { data: run } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return [];
  return must(
    await db()
      .from("recommendations")
      .select(`id, rank, fit, headline, why, risks, matched_drivers, is_wildcard, via_family, mode_key, created_at, games!inner(${GAME_LIST_COLUMNS})`)
      .eq("run_id", run.id)
      .order("rank"),
    "recommendations.latest",
  ) as unknown as LatestRec[];
}

/** Titelbilder für Anker-Spiele (Titel -> Bild). */
export type TitleImage = { id: string; header_image: string | null; capsule_image: string | null };
export async function imagesForTitles(titles: string[]): Promise<Map<string, TitleImage>> {
  const uniq = [...new Set(titles)].slice(0, 60);
  if (!uniq.length) return new Map();
  const { data } = await db().from("games").select("id, title, header_image, capsule_image").in("title", uniq);
  return new Map(((data ?? []) as (TitleImage & { title: string })[]).map((g) => [g.title, g]));
}
