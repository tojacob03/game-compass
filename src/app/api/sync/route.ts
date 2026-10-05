import { after, NextResponse } from "next/server";
import { driveJob, startJob } from "@/lib/jobs";
import { handleApiError } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { syncSteam } from "@/lib/sync";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await requireApiUser(req);
    const result = await syncSteam(user);
    // Neue Spiele direkt im Hintergrund analysieren lassen
    const job = await startJob(user, "analyze");
    after(() => driveJob(job.id));
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
