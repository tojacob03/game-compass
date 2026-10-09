import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { confirmEmail } from "@/lib/notify";

/** Bestätigungslink aus der Mail (signiert, 3 Tage gültig). */
export async function GET(req: Request) {
  const ok = await confirmEmail(new URL(req.url).searchParams).catch(() => false);
  return NextResponse.redirect(`${env().APP_URL.replace(/\/$/, "")}/deals?mail=${ok ? "bestaetigt" : "ungueltig"}`);
}
