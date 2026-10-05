import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { db, must } from "@/lib/db";
import { enqueueAnalysis, upsertSteamGame } from "@/lib/games";
import { requireApiUser } from "@/lib/session";
import { searchStore, steamHeaderImage } from "@/lib/steam";
import type { GameRow } from "@/lib/types";

/** Steam-Store durchsuchen (Autocomplete beim manuellen Hinzufügen). */
export async function GET(req: NextRequest) {
  try {
    await requireApiUser(req);
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    if (q.length < 2) return NextResponse.json({ items: [] });
    const items = (await searchStore(q)).slice(0, 8).map((i) => ({ appid: i.id, name: i.name, image: steamHeaderImage(i.id) }));
    return NextResponse.json({ items });
  } catch (err) {
    return handleApiError(err);
  }
}

const Body = z.object({
  steamAppid: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200),
  platform: z.string().trim().min(1).max(40),
  description: z.string().trim().max(2000).optional(),
});

/** Spiel manuell hinzufügen (z. B. PS5/Switch/GOG). Mit Steam-AppID werden Store-Daten genutzt. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = Body.parse(await req.json());

    let game: GameRow;
    if (body.steamAppid) {
      game = await upsertSteamGame(body.steamAppid, body.title);
    } else {
      const { data: existing } = await db()
        .from("games")
        .select("*")
        .is("steam_appid", null)
        .ilike("title", body.title)
        .limit(1)
        .maybeSingle();
      game =
        (existing as GameRow | null) ??
        (must(
          await db()
            .from("games")
            .insert({ title: body.title, short_description: body.description ?? null, created_by: user.id })
            .select("*")
            .single(),
          "games.insert",
        ) as GameRow);
    }

    must(
      await db()
        .from("user_games")
        .upsert(
          { user_id: user.id, game_id: game.id, manual: true, platform: body.platform, updated_at: new Date().toISOString() },
          { onConflict: "user_id,game_id" },
        ),
      "user_games.upsert",
    );
    if (!game.analyzed_at) await enqueueAnalysis(user.id, [{ gameId: game.id, priority: 80 }]);
    return NextResponse.json({ id: game.id });
  } catch (err) {
    return handleApiError(err);
  }
}
