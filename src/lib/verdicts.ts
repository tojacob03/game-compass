/** Eine Bewertungs-Skala für die ganze App (Schnell-Bewerten, Spielseite, "Schon gespielt"). */
export const VERDICT_SCORE = { love: 10, good: 7, meh: 5, bad: 3 } as const;
export type RatingVerdict = keyof typeof VERDICT_SCORE;

export const VERDICT_LABEL: Record<RatingVerdict, string> = { love: "Liebe ich", good: "Gut", meh: "Meh", bad: "Nicht meins" };

/** Ältere 1–10-Wertungen auf die Skala abbilden (gleiche Grenzen wie das Engagement-Modell). */
export function verdictOf(score: number | null): RatingVerdict | null {
  if (score == null) return null;
  if (score >= 9) return "love";
  if (score >= 7) return "good";
  if (score >= 5) return "meh";
  return "bad";
}
