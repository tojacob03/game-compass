import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { ensureGfnFresh } from "@/lib/gfn";
import { kickJob, startJob } from "@/lib/jobs";
import { mailConfigured } from "@/lib/mail";
import type { UserRow } from "@/lib/types";

export const maxDuration = 60;

/**
 * Täglicher Vercel-Cron (siehe vercel.json): GeForce-NOW-Liste auffrischen und für alle mit aktiven
 * Benachrichtigungen einen Deal-Check-Job starten (läuft in Etappen weiter, siehe jobs.ts).
 * Vercel schickt "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nicht erlaubt" }, { status: 401 });
  }
  await ensureGfnFresh().catch((e) => console.warn("GeForce NOW", e));
  if (!mailConfigured()) return NextResponse.json({ ok: true, started: 0, note: "E-Mail nicht eingerichtet" });

  const { data } = await db()
    .from("users")
    .select("*")
    .eq("status", "active")
    .not("email_verified_at", "is", null)
    .eq("notify->>enabled", "true");
  const users = (data ?? []) as UserRow[];
  const jobs = await Promise.all(users.map((u) => startJob(u, "deals")));
  await Promise.all(jobs.map((j) => kickJob(j.id)));
  return NextResponse.json({ ok: true, started: jobs.length });
}
