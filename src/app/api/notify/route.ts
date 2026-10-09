import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { db, must } from "@/lib/db";
import { BUNDLE_RATIOS, requestVerification, settingsOf } from "@/lib/notify";
import { requireApiUser } from "@/lib/session";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("email"), email: z.email().trim().toLowerCase().max(200) }),
  z.object({
    action: z.literal("settings"),
    enabled: z.boolean().optional(),
    bundles: z.boolean().optional(),
    deals: z.boolean().optional(),
    bundleRatio: z.number().refine((n) => (BUNDLE_RATIOS as readonly number[]).includes(n)).optional(),
  }),
]);

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = Body.parse(await req.json());
    if (body.action === "email") {
      await requestVerification(user, body.email);
      return NextResponse.json({ ok: true });
    }
    const patch = { enabled: body.enabled, bundles: body.bundles, deals: body.deals, bundleRatio: body.bundleRatio };
    const next = { ...settingsOf(user), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
    if (next.enabled && !user.email_verified_at) next.enabled = false; // erst nach Bestätigung
    must(await db().from("users").update({ notify: next }).eq("id", user.id), "users.notify");
    return NextResponse.json({ ok: true, notify: next });
  } catch (err) {
    return handleApiError(err);
  }
}
