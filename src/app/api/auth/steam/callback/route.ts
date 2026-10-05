import { NextResponse, type NextRequest } from "next/server";
import { db, must } from "@/lib/db";
import { adminSteamIds, env } from "@/lib/env";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions, STATE_COOKIE } from "@/lib/session";
import { getPlayerSummary, verifySteamLogin } from "@/lib/steam";
import type { UserRow } from "@/lib/types";

export async function GET(req: NextRequest) {
  const base = env().APP_URL.replace(/\/$/, "");
  const fail = (reason: string) => NextResponse.redirect(`${base}/?login_error=${encodeURIComponent(reason)}`);

  const params = req.nextUrl.searchParams;
  const state = params.get("state");
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;
  if (!state || !cookieState || state !== cookieState) return fail("Login abgelaufen, bitte erneut versuchen.");

  const steamId = await verifySteamLogin(params, `${base}/api/auth/steam/callback?state=${state}`).catch(() => null);
  if (!steamId) return fail("Steam-Login konnte nicht verifiziert werden.");

  const summary = await getPlayerSummary(steamId).catch(() => null);
  const isAdmin = adminSteamIds().has(steamId);

  const existing = (await db().from("users").select("*").eq("steam_id", steamId).maybeSingle()).data as UserRow | null;
  let user: UserRow;
  if (existing) {
    user = must(
      await db()
        .from("users")
        .update({
          display_name: summary?.personaname ?? existing.display_name,
          avatar_url: summary?.avatarfull ?? existing.avatar_url,
          ...(isAdmin ? { is_admin: true, status: "active" } : {}),
        })
        .eq("id", existing.id)
        .select("*")
        .single(),
      "users.update",
    ) as UserRow;
  } else {
    user = must(
      await db()
        .from("users")
        .insert({
          steam_id: steamId,
          display_name: summary?.personaname ?? `Steam ${steamId.slice(-4)}`,
          avatar_url: summary?.avatarfull ?? null,
          status: isAdmin ? "active" : "pending",
          is_admin: isAdmin,
        })
        .select("*")
        .single(),
      "users.insert",
    ) as UserRow;
  }

  const res = NextResponse.redirect(`${base}${user.status === "active" ? "/dashboard" : "/pending"}`);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/steam" });
  return res;
}
