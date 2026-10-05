import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { db, must } from "@/lib/db";
import { HttpError, requireApiUser } from "@/lib/session";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(60), isSteamFamily: z.boolean() }),
  z.object({ action: z.literal("join"), code: z.string().trim().min(6).max(32) }),
  z.object({ action: z.literal("leave"), groupId: z.uuid() }),
]);

function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = Body.parse(await req.json());

    if (body.action === "create") {
      const group = must(
        await db()
          .from("groups")
          .insert({ name: body.name, is_steam_family: body.isSteamFamily, invite_code: inviteCode(), created_by: user.id })
          .select("id")
          .single(),
        "groups.insert",
      ) as { id: string };
      must(await db().from("group_members").insert({ group_id: group.id, user_id: user.id }), "group_members.insert");
      return NextResponse.json({ id: group.id });
    }

    if (body.action === "join") {
      const { data: group } = await db().from("groups").select("id").eq("invite_code", body.code.toUpperCase()).maybeSingle();
      if (!group) throw new HttpError(404, "Einladungscode ungültig");
      must(
        await db().from("group_members").upsert({ group_id: group.id, user_id: user.id }, { onConflict: "group_id,user_id" }),
        "group_members.join",
      );
      return NextResponse.json({ id: group.id });
    }

    must(await db().from("group_members").delete().eq("group_id", body.groupId).eq("user_id", user.id), "group_members.leave");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
