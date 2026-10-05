import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, must } from "./db";
import { env } from "./env";
import { processQueue } from "./games";
import { RateLimitError } from "./gemini";
import { finalizeRecommendations, prepareRecommendations, runPendingCount } from "./recommend";
import { HttpError } from "./session";
import { buildTasteProfile, ensureLibraryFacts } from "./taste";
import type { UserRow } from "./types";
import { QuotaExceededError } from "./usage";

/**
 * Hintergrund-Jobs, die unabhängig vom Browser weiterlaufen.
 *
 * Kostenlose Server-Funktionen (Vercel Hobby) haben ein Zeitlimit. Deshalb arbeitet ein Job in ETAPPEN:
 * Jede Etappe holt sich eine exklusive Lease, arbeitet ~SLICE_MS, speichert den Fortschritt in der DB
 * und stößt per internem Aufruf die nächste Etappe an. Bricht eine Kette ab (Absturz, Deploy),
 * nimmt die nächste Fortschritts-Abfrage den Job wieder auf (siehe resumeStaleJobs).
 */

export type JobKind = "analyze" | "profile" | "recommend";
export type JobRow = {
  id: string;
  user_id: string;
  kind: JobKind;
  mode_key: string | null;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  stage: string | null;
  progress_done: number;
  progress_total: number;
  message: string | null;
  run_id: string | null;
  error: string | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

const SLICE_MS = 45_000; // Arbeitszeit pro Etappe – sicher unter dem 60-s-Limit
const LEASE_SECONDS = 70;
const ANALYSIS_PACING_MS = 4_000; // Free-Tier-freundlicher Abstand zwischen Analysen

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Internes Anstoßen der nächsten Etappe (abgesichert per HMAC aus SESSION_SECRET)
// ---------------------------------------------------------------------------

function tickSignature(jobId: string) {
  return createHmac("sha256", env().SESSION_SECRET).update(`job-tick:${jobId}`).digest("hex");
}

export function verifyTick(jobId: string, signature: string | null) {
  if (!signature) return false;
  const expected = Buffer.from(tickSignature(jobId));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Startet eine neue Etappe in einer eigenen Server-Funktion (eigenes Zeitbudget). */
export async function kickJob(jobId: string) {
  try {
    await fetch(`${env().APP_URL.replace(/\/$/, "")}/api/jobs/tick`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-job-signature": tickSignature(jobId) },
      body: JSON.stringify({ jobId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.warn("Job-Tick konnte nicht angestoßen werden (wird beim nächsten Polling fortgesetzt)", err);
  }
}

// ---------------------------------------------------------------------------
// Jobs anlegen / lesen
// ---------------------------------------------------------------------------

export async function startJob(user: UserRow, kind: JobKind, modeKey: string | null = null): Promise<JobRow> {
  // Läuft schon ein Job dieser Art? Dann den zurückgeben statt doppelt zu starten.
  const { data: active } = await db()
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .in("status", ["queued", "running"])
    .maybeSingle();
  if (active) return active as JobRow;

  const { data, error } = await db()
    .from("jobs")
    .insert({ user_id: user.id, kind, mode_key: modeKey, stage: "Wartet …" })
    .select("*")
    .single();
  if (error) {
    // Parallel gestartet (Unique-Index): den anderen zurückgeben
    const { data: other } = await db().from("jobs").select("*").eq("user_id", user.id).eq("kind", kind).in("status", ["queued", "running"]).maybeSingle();
    if (other) return other as JobRow;
    throw new Error(`jobs.insert: ${error.message}`);
  }
  return data as JobRow;
}

export async function listJobs(userId: string): Promise<JobRow[]> {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await db()
    .from("jobs")
    .select("*")
    .eq("user_id", userId)
    .or(`status.in.(queued,running),finished_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []) as JobRow[];
}

/** Jobs, deren Etappen-Kette abgerissen ist (Lease abgelaufen), wieder anstoßen. */
export function staleJobs(jobs: JobRow[]) {
  const now = Date.now();
  return jobs.filter(
    (j) =>
      (j.status === "queued" || j.status === "running") &&
      (!j.lease_until || Date.parse(j.lease_until) < now) &&
      now - Date.parse(j.updated_at) > 5_000,
  );
}

export async function cancelJob(userId: string, jobId: string) {
  must(
    await db()
      .from("jobs")
      .update({ status: "cancelled", finished_at: new Date().toISOString(), stage: "Abgebrochen", lease_until: null })
      .eq("id", jobId)
      .eq("user_id", userId)
      .in("status", ["queued", "running"]),
    "jobs.cancel",
  );
}

// ---------------------------------------------------------------------------
// Eine Etappe abarbeiten
// ---------------------------------------------------------------------------

async function update(jobId: string, patch: Partial<JobRow>) {
  await db()
    .from("jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function finish(jobId: string, status: "done" | "failed", patch: Partial<JobRow> = {}) {
  await update(jobId, { ...patch, status, lease_until: null, finished_at: new Date().toISOString() });
}

async function isCancelled(jobId: string) {
  const { data } = await db().from("jobs").select("status").eq("id", jobId).single();
  return (data as { status: string } | null)?.status === "cancelled";
}

type SliceResult = "done" | "continue";

/** Analyse-Warteschlange abarbeiten, bis leer, Zeit um oder Kontingent erschöpft. */
async function analyzeLoop(job: JobRow, deadline: number, opts: { runId?: string } = {}): Promise<"empty" | "timeout" | "quota"> {
  let done = job.progress_done;
  while (Date.now() < deadline) {
    if (await isCancelled(job.id)) return "timeout";
    let r;
    try {
      r = await processQueue(job.user_id, 1);
    } catch (err) {
      if (err instanceof QuotaExceededError) return "quota";
      throw err;
    }
    done += r.processed.length;
    const remaining = opts.runId ? await runPendingCount(opts.runId, job.user_id) : r.remaining;
    const last = r.processed.at(-1);
    await update(job.id, {
      progress_done: done,
      progress_total: Math.max(job.progress_total, done + remaining),
      message: last ? `${last.ok ? "✓" : "✗"} ${last.title}` : job.message,
    });
    if (remaining === 0) return "empty";
    const wait = r.retryAfterMs ?? ANALYSIS_PACING_MS;
    if (Date.now() + wait > deadline) return "timeout";
    await sleep(wait);
  }
  return "timeout";
}

async function runSliceInner(job: JobRow, user: UserRow, deadline: number): Promise<SliceResult> {
  switch (job.kind) {
    case "profile": {
      // Zuerst fehlende Spielzeiten/Chips nachladen – in kleinen Portionen, damit jede Etappe ins Zeitlimit passt
      for (;;) {
        await update(job.id, { stage: "Lade typische Spielzeiten …" });
        const left = await ensureLibraryFacts(user.id, { maxBatches: 2 });
        if (left === 0) break;
        if (Date.now() > deadline - 20_000) return "continue";
      }
      if (Date.now() > deadline - 35_000) return "continue"; // Profil-Erstellung braucht ein frisches Zeitbudget
      await update(job.id, { stage: "Analysiere deinen Geschmack …" });
      await buildTasteProfile(user);
      await finish(job.id, "done", { stage: "Profil aktualisiert", message: null });
      return "done";
    }

    case "analyze": {
      if (job.progress_total === 0) {
        const { count } = await db().from("analysis_queue").select("game_id", { count: "exact", head: true }).eq("requested_by", user.id);
        job.progress_total = count ?? 0;
        await update(job.id, { stage: "Analysiere Spiele …", progress_total: job.progress_total });
      }
      const res = await analyzeLoop(job, deadline);
      if (res === "empty") {
        await finish(job.id, "done", { stage: "Alle Spiele analysiert" });
        return "done";
      }
      if (res === "quota") {
        await finish(job.id, "done", { stage: "Tageskontingent erreicht – der Rest folgt morgen" });
        return "done";
      }
      return "continue";
    }

    case "recommend": {
      if (!job.run_id) {
        await update(job.id, { stage: "Prüfe Profil & sammle Kandidaten …" });
        const prep = await prepareRecommendations(user, job.mode_key);
        job.run_id = prep.runId;
        job.progress_total = prep.toAnalyze;
        await update(job.id, {
          run_id: prep.runId,
          progress_total: prep.toAnalyze,
          progress_done: 0,
          stage: prep.toAnalyze ? `Analysiere ${prep.toAnalyze} neue Kandidaten …` : "Wähle die besten aus …",
        });
        if (Date.now() > deadline - 20_000) return "continue";
      }
      const pending = await runPendingCount(job.run_id, user.id);
      if (pending > 0) {
        const res = await analyzeLoop(job, deadline, { runId: job.run_id });
        if (res === "timeout") return "continue";
        // "quota": mit den bereits analysierten Kandidaten weitermachen
      }
      if (Date.now() > deadline - 25_000) return "continue"; // Feinauswahl braucht frisches Zeitbudget
      await update(job.id, { stage: "Wähle die besten für dich aus …", message: null });
      await finalizeRecommendations(user, job.run_id);
      await finish(job.id, "done", { stage: "Empfehlungen sind da" });
      return "done";
    }
  }
}

/** Eine Etappe: Lease holen, arbeiten, ggf. nächste Etappe anstoßen. Gibt zurück, ob weitergemacht werden muss. */
export async function runSlice(jobId: string): Promise<boolean> {
  const { data: claimed } = await db().rpc("claim_job", { p_id: jobId, p_seconds: LEASE_SECONDS });
  if (claimed !== true) return false; // läuft schon woanders oder ist fertig

  const job = must(await db().from("jobs").select("*").eq("id", jobId).single(), "jobs.get") as JobRow;
  const user = (await db().from("users").select("*").eq("id", job.user_id).single()).data as UserRow | null;
  if (!user || user.status !== "active") {
    await finish(jobId, "failed", { error: "Nutzer nicht aktiv" });
    return false;
  }

  const deadline = Date.now() + SLICE_MS;
  try {
    const res = await runSliceInner(job, user, deadline);
    if (res === "continue") {
      await update(jobId, { lease_until: null });
      return true;
    }
    return false;
  } catch (err) {
    if (err instanceof RateLimitError) {
      await update(jobId, { lease_until: null, message: "KI kurz ausgelastet – geht gleich weiter" });
      await sleep(Math.min(err.retryAfterMs, 15_000));
      return true;
    }
    const message = err instanceof HttpError ? err.message : "Unerwarteter Fehler – bitte nochmal versuchen.";
    console.error(`Job ${jobId} (${job.kind}) fehlgeschlagen`, err);
    await finish(jobId, "failed", { error: message, stage: "Fehlgeschlagen" });
    return false;
  }
}

/** Etappe ausführen und bei Bedarf die nächste anstoßen (für after()). */
export async function driveJob(jobId: string) {
  const more = await runSlice(jobId);
  if (more) await kickJob(jobId);
}
