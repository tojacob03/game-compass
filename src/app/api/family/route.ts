import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { addFamilyMember, addGamesToMember, removeFamilyMember, removeGameFromMember, syncFamilyMember } from "@/lib/family";
import { ensureSteamGames } from "@/lib/importer";
import { requireApiUser } from "@/lib/session";

export const maxDuration = 60;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), name: z.string().trim().max(60).optional(), steam: z.string().trim().max(200).optional() }),
  z.object({ action: z.literal("remove"), memberId: z.uuid() }),
  z.object({ action: z.literal("sync"), memberId: z.uuid() }),
  z.object({ action: z.literal("addGame"), memberId: z.uuid(), steamAppid: z.number().int().positive(), title: z.string().trim().min(1).max(200) }),
  z.object({ action: z.literal("removeGame"), memberId: z.uuid(), gameId: z.uuid() }),
]);

/** Steam-Familie: Mitglieder ohne Konto verwalten und deren Spiele pflegen. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = Body.parse(await req.json());
    switch (body.action) {
      case "add":
        return NextResponse.json({ id: await addFamilyMember(user, body) });
      case "remove":
        await removeFamilyMember(user, body.memberId);
        return NextResponse.json({ ok: true });
      case "sync":
        return NextResponse.json({ games: await syncFamilyMember(user, body.memberId) });
      case "addGame": {
        const ids = await ensureSteamGames([{ appid: body.steamAppid, title: body.title }]);
        await addGamesToMember(user, body.memberId, [...ids.values()], "manual");
        return NextResponse.json({ ok: true });
      }
      case "removeGame":
        await removeGameFromMember(user, body.memberId, body.gameId);
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    return handleApiError(err);
  }
}
