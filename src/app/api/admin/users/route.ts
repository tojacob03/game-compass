import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { db, must } from "@/lib/db";
import { HttpError, requireApiUser } from "@/lib/session";

const Body = z.object({ userId: z.uuid(), status: z.enum(["active", "blocked", "pending"]) });

export async function POST(req: Request) {
  try {
    const admin = await requireApiUser(req, { admin: true });
    const body = Body.parse(await req.json());
    if (body.userId === admin.id) throw new HttpError(400, "Du kannst dich nicht selbst sperren.");
    must(await db().from("users").update({ status: body.status }).eq("id", body.userId), "users.status");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
