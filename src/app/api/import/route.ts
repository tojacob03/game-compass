import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { refreshMissingAssets } from "@/lib/assets";
import { db, must } from "@/lib/db";
import { addGamesToMember } from "@/lib/family";
import { MAX_IMPORT_ROWS, parseGameList, resolveEntries } from "@/lib/importer";
import { HttpError, requireApiUser } from "@/lib/session";

export const maxDuration = 60;

const Body = z.object({
  text: z.string().max(300_000),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("member"), memberId: z.uuid() }),
    z.object({ kind: z.literal("self"), platform: z.string().trim().min(1).max(40) }),
  ]),
});

/** Spieleliste (CSV oder eine Zeile pro Spiel) importieren – für ein Familienmitglied oder die eigenen Spiele anderer Plattformen. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = Body.parse(await req.json());
    const entries = parseGameList(body.text);
    if (!entries.length) throw new HttpError(400, "Keine Spiele erkannt – eine Zeile pro Spiel (Titel oder Steam-AppID) oder eine CSV mit Spalte „title“/„appid“.");
    const res = await resolveEntries(entries);

    if (body.target.kind === "member") {
      await addGamesToMember(user, body.target.memberId, res.gameIds, "csv");
    } else {
      const now = new Date().toISOString();
      const { data: existing } = await db().from("user_games").select("game_id").eq("user_id", user.id).in("game_id", res.gameIds);
      const have = new Set(((existing ?? []) as { game_id: string }[]).map((r) => r.game_id));
      // Bereits vorhandene Einträge (z. B. Steam) nur als "auch manuell" markieren, nichts überschreiben
      const fresh = res.gameIds.filter((id) => !have.has(id));
      if (fresh.length) {
        must(
          await db().from("user_games").insert(fresh.map((id) => ({ user_id: user.id, game_id: id, manual: true, platform: body.target.kind === "self" ? body.target.platform : null, updated_at: now }))),
          "user_games.import",
        );
      }
      await refreshMissingAssets().catch((e) => console.warn("Assets", e));
    }
    return NextResponse.json({
      imported: res.gameIds.length,
      unresolved: res.unresolved.slice(0, 50),
      unresolvedCount: res.unresolved.length,
      truncated: entries.length >= MAX_IMPORT_ROWS,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
