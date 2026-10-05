import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { STATE_COOKIE } from "@/lib/session";
import { steamLoginUrl } from "@/lib/steam";

export async function GET() {
  const state = crypto.randomUUID();
  const base = env().APP_URL.replace(/\/$/, "");
  const returnTo = `${base}/api/auth/steam/callback?state=${state}`;
  const res = NextResponse.redirect(steamLoginUrl(returnTo, base));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/steam",
    maxAge: 600,
  });
  return res;
}
