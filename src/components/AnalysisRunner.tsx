"use client";

import { JobControl, useLatestJob } from "./jobs";

/** KI-Analyse der Warteschlange – läuft als Server-Job, unabhängig von der offenen Seite. */
export function AnalysisRunner({ initialRemaining }: { initialRemaining: number }) {
  const job = useLatestJob("analyze");
  const running = job && (job.status === "queued" || job.status === "running");
  if (initialRemaining === 0 && !running) {
    return <p className="text-sm text-muted">Alle eingereihten Spiele sind analysiert.</p>;
  }
  return (
    <div className="space-y-2">
      {!running && <p className="text-sm text-muted">{initialRemaining} Spiele warten auf ihre Analyse.</p>}
      <JobControl kind="analyze" label="KI-Analyse starten" />
      <p className="text-xs text-muted">
        Jedes Spiel wird einmal analysiert (Beschreibung + echte Steam-Reviews) und dann für alle geteilt. Startet nach jedem
        Steam-Sync automatisch.
      </p>
    </div>
  );
}
