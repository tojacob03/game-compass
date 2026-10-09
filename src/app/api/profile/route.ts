import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { removeCorrection, setCorrection, setWeight } from "@/lib/corrections";
import { db, must } from "@/lib/db";
import { requireApiUser } from "@/lib/session";
import { PLATFORM_KEYS } from "@/lib/platforms";
import { markProfileStale } from "@/lib/taste";

const Item = {
  kind: z.enum(["driver", "aversion"]),
  modeKey: z.string().max(60).nullable(),
  name: z.string().trim().min(1).max(120),
};

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("about"), aboutMe: z.string().trim().max(3000) }),
  z.object({ action: z.literal("platforms"), platforms: z.array(z.enum(PLATFORM_KEYS as [string, ...string[]])).min(1).max(5) }),
  z.object({ action: z.literal("correct"), ...Item, verdict: z.enum(["confirm", "reject"]) }),
  z.object({ action: z.literal("uncorrect"), ...Item }),
  z.object({ action: z.literal("weight"), ...Item, weight: z.number().int().min(1).max(5) }),
  z.object({ action: z.literal("add"), ...Item, description: z.string().trim().max(300).optional() }),
]);

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = Body.parse(await req.json());
    if (body.action === "about") {
      must(await db().from("users").update({ about_me: body.aboutMe || null }).eq("id", user.id), "users.about");
      await markProfileStale(user.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "platforms") {
      must(await db().from("users").update({ platforms: [...new Set(body.platforms)] }).eq("id", user.id), "users.platforms");
      await db().from("user_deals").delete().eq("user_id", user.id); // Deals für die neuen Plattformen neu berechnen
      return NextResponse.json({ ok: true });
    }
    const item = { kind: body.kind, mode_key: body.modeKey, name: body.name };
    // Gewichte und eigene Einträge wirken sofort (beim Lesen des Profils) – keine Neuberechnung nötig
    if (body.action === "correct") await setCorrection(user.id, { ...item, verdict: body.verdict });
    else if (body.action === "weight") await setWeight(user.id, item, body.weight);
    else if (body.action === "add") await setCorrection(user.id, { ...item, verdict: "add", weight: 4, description: body.description || null });
    else await removeCorrection(user.id, item);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
