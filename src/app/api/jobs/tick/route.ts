import { after, NextResponse } from "next/server";
import { z } from "zod";
import { driveJob, verifyTick } from "@/lib/jobs";

export const maxDuration = 60;

/** Interner Endpunkt: nächste Etappe eines Jobs. Nur mit gültiger HMAC-Signatur aufrufbar. */
export async function POST(req: Request) {
  const parsed = z.object({ jobId: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success || !verifyTick(parsed.data.jobId, req.headers.get("x-job-signature"))) {
    return NextResponse.json({ error: "Nicht erlaubt" }, { status: 403 });
  }
  after(() => driveJob(parsed.data.jobId));
  return NextResponse.json({ ok: true }, { status: 202 });
}
