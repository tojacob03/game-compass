import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { db, must } from "@/lib/db";
import { enqueueAnalysis } from "@/lib/games";
import { HttpError, requireApiUser } from "@/lib/session";
import { markProfileStale } from "@/lib/taste";

const Body = z.object({
  score: z.number().int().min(1).max(10).nullable(),
  loved: z.string().trim().max(2000).nullable(),
  disliked: z.string().trim().max(2000).nullable(),
  status: z.enum(["backlog", "playing", "finished", "dropped"]).nullable(),
  likedAspects: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  dislikedAspects: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
});

/** Bewertung + Status speichern. */
export async function POST(req: Request, ctx: RouteContext<"/api/games/[id]">) {
  try {
    const user = await requireApiUser(req);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new HttpError(400, "Ungültige ID");
    const body = Body.parse(await req.json());

    const { data: game } = await db().from("games").select("id, analyzed_at").eq("id", id).maybeSingle();
    if (!game) throw new HttpError(404, "Spiel nicht gefunden");

    const hasRating = body.score != null || !!body.loved || !!body.disliked || body.likedAspects.length > 0 || body.dislikedAspects.length > 0;
    must(
      await db()
        .from("user_games")
        .upsert(
          {
            user_id: user.id,
            game_id: id,
            score: body.score,
            loved: body.loved || null,
            disliked: body.disliked || null,
            status: body.status,
            liked_aspects: body.likedAspects,
            disliked_aspects: body.dislikedAspects,
            rated_at: hasRating ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,game_id" },
        ),
      "user_games.rate",
    );
    await markProfileStale(user.id);
    if (!game.analyzed_at) await enqueueAnalysis(user.id, [{ gameId: id, priority: 90 }]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
