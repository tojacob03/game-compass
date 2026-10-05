import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { db, must } from "@/lib/db";
import { requireApiUser } from "@/lib/session";
import { markProfileStale } from "@/lib/taste";

const Body = z.object({ action: z.literal("about"), aboutMe: z.string().trim().max(3000) });

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = Body.parse(await req.json());
    must(await db().from("users").update({ about_me: body.aboutMe || null }).eq("id", user.id), "users.about");
    await markProfileStale(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
