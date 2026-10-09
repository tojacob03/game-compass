import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { quickRateBatch, saveQuickRating } from "@/lib/quickrate";
import { saveStarterRating, starterBatch, starterCardFor } from "@/lib/starter";
import { requireApiUser } from "@/lib/session";

export const maxDuration = 60;

const Aspect = z.string().trim().min(1).max(60);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("batch") }),
  z.object({ action: z.literal("starterBatch") }),
  z.object({ action: z.literal("starterAdd"), steamAppid: z.number().int().positive(), title: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("starterRate"), gameId: z.uuid(), verdict: z.enum(["love", "good", "meh", "bad", "skip"]) }),
  z.object({
    action: z.literal("rate"),
    gameId: z.uuid(),
    verdict: z.enum(["love", "good", "meh", "bad", "skip"]),
    liked: z.array(Aspect).max(10).default([]),
    disliked: z.array(Aspect).max(10).default([]),
    note: z.string().trim().max(1000).optional(),
    score: z.number().int().min(1).max(10).optional(),
    loved: z.string().trim().max(2000).optional(),
    dislikedText: z.string().trim().max(2000).optional(),
  }),
]);

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = Body.parse(await req.json());
    if (body.action === "batch") return NextResponse.json(await quickRateBatch(user.id));
    if (body.action === "starterBatch") return NextResponse.json({ cards: await starterBatch(user.id) });
    if (body.action === "starterAdd") return NextResponse.json({ card: await starterCardFor(body.steamAppid, body.title) });
    if (body.action === "starterRate") {
      await saveStarterRating(user.id, body.gameId, body.verdict);
      return NextResponse.json({ ok: true });
    }
    await saveQuickRating(user.id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
