import { after, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { cancelJob, driveJob, listJobs, staleJobs, startJob } from "@/lib/jobs";
import { requireApiUser } from "@/lib/session";

export const maxDuration = 60;

/** Aktive + kürzlich beendete Jobs. Nimmt dabei abgerissene Jobs wieder auf. */
export async function GET(req: Request) {
  try {
    const user = await requireApiUser(req);
    const jobs = await listJobs(user.id);
    const stale = staleJobs(jobs);
    if (stale.length) after(() => Promise.all(stale.map((j) => driveJob(j.id))));
    return NextResponse.json({ jobs });
  } catch (err) {
    return handleApiError(err);
  }
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), kind: z.enum(["analyze", "profile", "recommend", "deals"]), mode: z.string().max(60).nullable().optional() }),
  z.object({ action: z.literal("cancel"), jobId: z.uuid() }),
]);

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const body = Body.parse(await req.json());
    if (body.action === "cancel") {
      await cancelJob(user.id, body.jobId);
      return NextResponse.json({ ok: true });
    }
    const job = await startJob(user, body.kind, body.kind === "recommend" ? (body.mode ?? null) : null);
    after(() => driveJob(job.id));
    return NextResponse.json({ job });
  } catch (err) {
    return handleApiError(err);
  }
}
