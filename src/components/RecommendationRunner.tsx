"use client";

import { JobControl } from "./jobs";

export function RecommendationRunner({ hasRecs, mode, modeLabel }: { hasRecs: boolean; mode: string | null; modeLabel: string }) {
  return (
    <div className="card space-y-3 p-4">
      <div className="min-w-0">
        <h2 className="h2">{hasRecs ? `Neue Runde: ${modeLabel}` : `Empfehlungen: ${modeLabel}`}</h2>
        <p className="text-sm text-muted">
          Dauert ein paar Minuten – neue Kandidaten werden erst gründlich analysiert. Neue Bewertungen und deine Einstellungen
          unter Geschmack fließen automatisch ein. Läuft im Hintergrund weiter.
        </p>
      </div>
      <JobControl kind="recommend" mode={mode} label={hasRecs ? "Neu generieren" : "Generieren"} />
    </div>
  );
}
