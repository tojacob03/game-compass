import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { db } from "./db";
import type { UserRow } from "./types";

export const SESSION_COOKIE = "gc_session";
export const STATE_COOKIE = "gc_oid_state";
const SESSION_DAYS = 30;

function key() {
  return new TextEncoder().encode(env().SESSION_SECRET);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key());
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

/** Liefert den eingeloggten Nutzer (egal welcher Status) oder null. */
export async function getSessionUser(): Promise<UserRow | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const { data } = await db().from("users").select("*").eq("id", payload.sub).maybeSingle();
    return (data as UserRow | null) ?? null;
  } catch {
    return null;
  }
}

/** Für Seiten: leitet um, wenn nicht eingeloggt oder (noch) nicht freigeschaltet. */
export async function requireUser(): Promise<UserRow> {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.status !== "active") redirect("/pending");
  return user;
}

export async function requireAdmin(): Promise<UserRow> {
  const user = await requireUser();
  if (!user.is_admin) redirect("/dashboard");
  return user;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Für API-Routen: prüft Session, Status und – bei schreibenden Requests – den Origin
 * (zusätzlicher CSRF-Schutz neben SameSite=Lax).
 */
export async function requireApiUser(req: Request, opts: { admin?: boolean } = {}): Promise<UserRow> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (!origin || origin !== new URL(env().APP_URL).origin) {
      throw new HttpError(403, "Ungültiger Origin");
    }
  }
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Nicht eingeloggt");
  if (user.status !== "active") throw new HttpError(403, "Account noch nicht freigeschaltet");
  if (opts.admin && !user.is_admin) throw new HttpError(403, "Nur für Admins");
  return user;
}
