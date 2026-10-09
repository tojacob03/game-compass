import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { unsubscribe } from "@/lib/notify";

/** Abmelde-Link aus jeder Benachrichtigung (signiert, funktioniert ohne Login). */
export async function GET(req: Request) {
  const ok = await unsubscribe(new URL(req.url).searchParams).catch(() => false);
  return NextResponse.redirect(`${env().APP_URL.replace(/\/$/, "")}/deals?mail=${ok ? "abgemeldet" : "ungueltig"}`);
}

// One-Click-Abmeldung (List-Unsubscribe-Post) von Mail-Programmen
export const POST = GET;
