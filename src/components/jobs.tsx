"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/client";

export type Job = {
  id: string;
  kind: "analyze" | "profile" | "recommend";
  mode_key: string | null;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  stage: string | null;
  progress_done: number;
  progress_total: number;
  message: string | null;
  error: string | null;
  created_at: string;
};

const isActive = (j: Job) => j.status === "queued" || j.status === "running";

type Ctx = {
  jobs: Job[];
  start: (kind: Job["kind"], mode?: string | null) => Promise<void>;
  cancel: (id: string) => Promise<void>;
};
const JobsContext = createContext<Ctx | null>(null);

/**
 * Hält den Zustand aller Hintergrund-Jobs. Die eigentliche Arbeit passiert auf dem Server –
 * die Seite fragt nur den Fortschritt ab. Seite wechseln, Tab schließen: Der Job läuft weiter.
 */
export function JobsProvider({ initial, children }: { initial: Job[]; children: React.ReactNode }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initial);
  const activeIds = useRef(new Set(initial.filter(isActive).map((j) => j.id)));
  const [pollNow, setPollNow] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (res.ok && !cancelled) {
          const { jobs: next } = (await res.json()) as { jobs: Job[] };
          setJobs(next);
          // Gerade fertig geworden? -> Seite mit frischen Daten neu laden
          const nowActive = new Set(next.filter(isActive).map((j) => j.id));
          const finished = [...activeIds.current].some((id) => !nowActive.has(id));
          activeIds.current = nowActive;
          if (finished) router.refresh();
        }
      } catch {
        /* offline o. Ä. – beim nächsten Mal */
      }
      if (!cancelled) timer = setTimeout(poll, activeIds.current.size ? 2500 : 20000);
    };
    timer = setTimeout(poll, pollNow ? 300 : activeIds.current.size ? 2500 : 20000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [router, pollNow]);

  const start = useCallback(async (kind: Job["kind"], mode?: string | null) => {
    const { job } = await postJson<{ job: Job }>("/api/jobs", { action: "start", kind, mode: mode ?? null });
    activeIds.current.add(job.id);
    setJobs((cur) => [job, ...cur.filter((j) => j.id !== job.id)]);
    setPollNow((n) => n + 1);
  }, []);

  const cancel = useCallback(async (id: string) => {
    await postJson("/api/jobs", { action: "cancel", jobId: id });
    setPollNow((n) => n + 1);
  }, []);

  return <JobsContext.Provider value={{ jobs, start, cancel }}>{children}</JobsContext.Provider>;
}

export function useJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs außerhalb von JobsProvider");
  return ctx;
}

/** Neuester Job einer Art (bei Empfehlungen: für genau diesen Modus). */
export function useLatestJob(kind: Job["kind"], mode?: string | null) {
  const { jobs } = useJobs();
  return jobs.find((j) => j.kind === kind && (kind !== "recommend" || (j.mode_key ?? null) === (mode ?? null)));
}

const KIND_LABEL: Record<Job["kind"], string> = { analyze: "KI-Analyse", profile: "Profil", recommend: "Empfehlungen" };
const KIND_HREF: Record<Job["kind"], string> = { analyze: "/dashboard", profile: "/profile", recommend: "/recommendations" };

/** Start-Knopf + Fortschritt für einen Job-Typ. */
export function JobControl({
  kind,
  mode = null,
  label,
  className = "btn-primary",
  showIdleHint,
}: {
  kind: Job["kind"];
  mode?: string | null;
  label: string;
  className?: string;
  showIdleHint?: string;
}) {
  const { start, cancel } = useJobs();
  const job = useLatestJob(kind, mode);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const running = !!job && isActive(job);

  async function onStart() {
    setStarting(true);
    setError(null);
    try {
      await start(kind, mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setStarting(false);
    }
  }

  const pct = job && job.progress_total ? Math.min(100, (job.progress_done / job.progress_total) * 100) : null;

  return (
    <div className="space-y-2">
      {!running && (
        <button className={className} onClick={onStart} disabled={starting}>
          {starting ? "Startet …" : label}
        </button>
      )}
      {running && job && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>
              {job.stage ?? "Läuft …"}
              {job.progress_total > 0 && (
                <span className="text-muted">
                  {" "}
                  ({job.progress_done}/{job.progress_total})
                </span>
              )}
            </span>
            <button className="text-xs text-muted hover:text-bad" onClick={() => cancel(job.id)}>
              Abbrechen
            </button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full animate-shimmer rounded-full bg-[linear-gradient(90deg,var(--accent),#ffe2a8,var(--accent-2),var(--accent))] bg-[length:200%_100%] transition-[width] duration-700"
              style={{ width: `${pct === null ? 35 : Math.max(4, pct)}%` }}
            />
          </div>
          {job.message && <p className="truncate text-xs text-muted">{job.message}</p>}
          <p className="text-xs text-muted">Läuft auf dem Server weiter – du kannst die Seite wechseln oder schließen.</p>
        </div>
      )}
      {!running && job?.status === "done" && job.stage && <p className="text-sm text-good">✓ {job.stage}</p>}
      {!running && job?.status === "failed" && <p className="text-sm text-bad">{job.error ?? "Fehlgeschlagen"}</p>}
      {!running && !job && showIdleHint && <p className="text-xs text-muted">{showIdleHint}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

/** Kleine Statusanzeige im Header – auf jeder Seite sichtbar. */
export function JobPill() {
  const { jobs } = useJobs();
  const active = jobs.filter(isActive);
  if (!active.length) return null;
  const j = active[0];
  return (
    <Link
      href={KIND_HREF[j.kind]}
      className="flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent"
      title={j.stage ?? ""}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
      {KIND_LABEL[j.kind]}
      {j.progress_total > 0 && (
        <span className="text-accent/80">
          {j.progress_done}/{j.progress_total}
        </span>
      )}
      {active.length > 1 && <span className="text-accent/70">+{active.length - 1}</span>}
    </Link>
  );
}
