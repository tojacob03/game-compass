/**
 * Engagement statt Besitz: Wie stark spricht ein Spiel für den Geschmack einer Person?
 * Explizite Bewertungen schlagen alles; sonst zählt die Spielzeit RELATIV zur typischen Spielzeit.
 * (Reine Funktion – ohne DB, damit sie in Server und Client nutzbar ist.)
 */

export type EngagementLabel = "liebt" | "stark" | "solide" | "läuft gerade" | "angespielt" | "nicht gezündet" | "abgelehnt" | "neutral";

export type Engagement = { weight: number; label: EngagementLabel; explicit: boolean };

export type EngagementInput = {
  playtime_minutes: number;
  last_played_at: string | null;
  score: number | null;
  status: string | null;
  rate_skipped_at: string | null;
  typical_minutes: number | null;
  endless?: boolean;
};

const DAY = 24 * 60 * 60 * 1000;

/** null = kein verwertbares Signal (zu kurz gespielt oder ausdrücklich "nicht richtig gespielt"). */
export function engagementOf(g: EngagementInput, now = Date.now()): Engagement | null {
  if (g.score != null) {
    if (g.score >= 9) return { weight: 1, label: "liebt", explicit: true };
    if (g.score >= 7) return { weight: 0.7, label: "stark", explicit: true };
    if (g.score >= 5) return { weight: 0.15, label: "neutral", explicit: true };
    return { weight: -0.8, label: "abgelehnt", explicit: true };
  }
  if (g.rate_skipped_at) return null;
  if (g.status === "dropped") return { weight: -0.5, label: "nicht gezündet", explicit: true };

  const h = g.playtime_minutes / 60;
  if (h < 1) return null;
  const typical = Math.max(2, (g.typical_minutes ?? 15 * 60) / 60);
  const r = h / typical;
  const recent = g.last_played_at ? now - Date.parse(g.last_played_at) < 45 * DAY : false;

  if (h >= 150 || r >= 1.5) return { weight: 1, label: "liebt", explicit: false };
  if (r >= 0.8 || g.status === "finished") return { weight: 0.7, label: "stark", explicit: false };
  if (r >= 0.35) return { weight: 0.45, label: "solide", explicit: false };
  if (recent || g.status === "playing") return { weight: 0.25, label: "läuft gerade", explicit: false };
  if (r < 0.15 && !g.endless) return { weight: -0.3, label: "nicht gezündet", explicit: false };
  return { weight: 0.1, label: "angespielt", explicit: false };
}

export const ENGAGEMENT_STYLE: Record<EngagementLabel, string> = {
  liebt: "text-good",
  stark: "text-good",
  solide: "text-text",
  "läuft gerade": "text-accent",
  angespielt: "text-muted",
  "nicht gezündet": "text-bad",
  abgelehnt: "text-bad",
  neutral: "text-muted",
};
