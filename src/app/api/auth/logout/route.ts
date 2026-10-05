import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(env().APP_URL).origin) return NextResponse.json({ error: "Ungültiger Origin" }, { status: 403 });
  const res = NextResponse.redirect(new URL("/", env().APP_URL), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
