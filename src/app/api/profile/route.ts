import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { removeCorrection, setCorrection } from "@/lib/corrections";
import { db, must } from "@/lib/db";
import { requireApiUser } from "@/lib/session";
import { markProfileStale } from "@/lib/taste";

const Item = {
  kind: z.enum(["driver", "aversion"]),
  modeKey: z.string().max(60).nullable(),
  name: z.string().trim().min(1).max(120),
};

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("about"), aboutMe: z.string().trim().max(3000) }),
  z.object({ action: z.literal("correct"), ...Item, verdict: z.enum(["confirm", "reject"]) }),
  z.object({ action: z.literal("uncorrect"), ...Item }),
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
    const item = { kind: body.kind, mode_key: body.modeKey, name: body.name };
    if (body.action === "correct") await setCorrection(user.id, { ...item, verdict: body.verdict });
    else await removeCorrection(user.id, item);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
