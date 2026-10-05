import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { db, must } from "@/lib/db";
import { requireApiUser } from "@/lib/session";
import { markProfileStale } from "@/lib/taste";

const Body = z.object({
  gameId: z.uuid(),
  verdict: z.enum(["interested", "not_interested", "already_played"]),
  reason: z.string().trim().max(1000).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = Body.parse(await req.json());
    must(
      await db()
        .from("rec_feedback")
        .upsert(
          { user_id: user.id, game_id: body.gameId, verdict: body.verdict, reason: body.reason || null },
          { onConflict: "user_id,game_id" },
        ),
      "rec_feedback.upsert",
    );
    // 👍/👎 wirkt sofort über die Such-Facetten; nur eine Begründung lohnt eine Profil-Neuberechnung
    if (body.reason) await markProfileStale(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
