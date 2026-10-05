import "server-only";
import { db, fetchAll, must } from "./db";
import { engagementOf } from "./engagement";
import { ensureGameFacts } from "./gamefacts";
import { markProfileStale } from "./taste";
import type { GameChips } from "./types";

export type QuickCard = {
  gameId: string;
  title: string;
  header_image: string | null;
  hours: number;
  typicalHours: number | null;
  hint: string;
  loved: string[];
  criticized: string[];
};

type Row = {
  game_id: string;
  playtime_minutes: number;
  last_played_at: string | null;
  status: string | null;
  manual: boolean;
  platform: string | null;
  games: { title: string; header_image: string | null; median_playtime_minutes: number | null; chips: GameChips | null };
};

async function unratedRows(userId: string) {
  return fetchAll<Row>(
    (from, to) =>
      db()
        .from("user_games")
        .select("game_id, playtime_minutes, last_played_at, status, manual, platform, games!inner(title, header_image, median_playtime_minutes, chips)")
        .eq("user_id", userId)
        .eq("games.is_software", false)
        .is("score", null)
        .is("rate_skipped_at", null)
        .or("playtime_minutes.gte.60,manual.eq.true")
        .order("game_id")
        .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    "quickrate.unrated",
  );
}

/** Nur zählen (Header-Badge auf jeder Seite) – ohne die Zeilen zu übertragen. */
export async function countUnrated(userId: string) {
  const { count } = await db()
    .from("user_games")
    .select("game_id, games!inner(is_software)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("games.is_software", false)
    .is("score", null)
    .is("rate_skipped_at", null)
    .or("playtime_minutes.gte.60,manual.eq.true");
  return count ?? 0;
}

/**
 * Nächste Spiele für die Schnell-Bewertung – nach Informationswert sortiert:
 * viel Spielzeit zuerst, unklare Fälle ("angespielt", "nicht gezündet") werden vorgezogen,
 * weil eine Bewertung dort am meisten über den Geschmack verrät.
 */
export async function quickRateBatch(userId: string, n = 8): Promise<{ cards: QuickCard[]; remaining: number }> {
  const rows = await unratedRows(userId);
  const ranked = rows
    .map((r) => {
      const e = engagementOf({
        playtime_minutes: r.playtime_minutes,
        last_played_at: r.last_played_at,
        score: null,
        status: r.status,
        rate_skipped_at: null,
        typical_minutes: r.games.median_playtime_minutes,
        endless: r.games.chips?.endless,
      });
      const h = r.playtime_minutes / 60;
      const unclear = !e || ["angespielt", "nicht gezündet", "läuft gerade", "solide"].includes(e.label);
      return { r, e, value: Math.log1p(h + (r.manual ? 5 : 0)) * (unclear ? 1.35 : 1) };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, n);

  await ensureGameFacts(
    userId,
    ranked.filter((x) => !x.r.games.chips).map((x) => x.r.game_id),
  );
  const ids = ranked.map((x) => x.r.game_id);
  const fresh = ids.length
    ? (must(await db().from("games").select("id, chips, median_playtime_minutes").in("id", ids), "games.chips") as {
        id: string;
        chips: GameChips | null;
        median_playtime_minutes: number | null;
      }[])
    : [];
  const facts = new Map(fresh.map((f) => [f.id, f]));

  const cards = ranked.map(({ r, e }) => {
    const f = facts.get(r.game_id);
    const typical = f?.median_playtime_minutes ?? r.games.median_playtime_minutes;
    const hint = r.manual
      ? `Auf ${r.platform ?? "einer anderen Plattform"} gespielt`
      : e?.label === "liebt"
        ? "Du hast hier richtig viel Zeit verbracht"
        : e?.label === "nicht gezündet"
          ? "Kurz gespielt – hat's nicht gezündet?"
          : e?.label === "läuft gerade"
            ? "Spielst du gerade – erster Eindruck?"
            : "Wie war's?";
    return {
      gameId: r.game_id,
      title: r.games.title,
      header_image: r.games.header_image,
      hours: Math.round(r.playtime_minutes / 60),
      typicalHours: typical ? Math.round(typical / 60) : null,
      hint,
      loved: f?.chips?.loved ?? [],
      criticized: f?.chips?.criticized ?? [],
    };
  });
  return { cards, remaining: rows.length };
}

export const VERDICT_SCORE = { love: 10, good: 7, meh: 5, bad: 3 } as const;
export type Verdict = keyof typeof VERDICT_SCORE | "skip";

export async function saveQuickRating(
  userId: string,
  input: { gameId: string; verdict: Verdict; liked: string[]; disliked: string[]; note?: string },
) {
  const now = new Date().toISOString();
  const patch =
    input.verdict === "skip"
      ? { rate_skipped_at: now }
      : {
          score: VERDICT_SCORE[input.verdict],
          liked_aspects: input.liked,
          disliked_aspects: input.disliked,
          ...(input.note ? (input.verdict === "bad" ? { disliked: input.note } : { loved: input.note }) : {}),
          rated_at: now,
        };
  must(
    await db()
      .from("user_games")
      .update({ ...patch, updated_at: now })
      .eq("user_id", userId)
      .eq("game_id", input.gameId),
    "quickrate.save",
  );
  if (input.verdict !== "skip") await markProfileStale(userId);
}
