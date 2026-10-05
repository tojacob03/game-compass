import "server-only";
import { db } from "./db";
import { env } from "./env";
import { HttpError } from "./session";

/**
 * Zwei getrennte Tagesbudgets:
 * - "analysis": einmalige Spiel-Analysen (Ergebnis wird für alle geteilt)
 * - "interactive": Profil, Empfehlungen, Chat
 * So kann eine große Bibliothek nie Empfehlungen oder Chat blockieren.
 */
export type AiKind = "analysis" | "interactive";

export class QuotaExceededError extends HttpError {
  constructor(public kind: AiKind) {
    super(
      429,
      kind === "analysis"
        ? "Das Analyse-Kontingent für heute ist aufgebraucht – Empfehlungen und Chat funktionieren weiter, die restlichen Spiele werden morgen analysiert."
        : "Dein KI-Tageskontingent für Profil, Empfehlungen und Chat ist aufgebraucht – morgen geht's weiter.",
    );
  }
}

export async function consumeAi(userId: string, units = 1, kind: AiKind = "interactive") {
  const limit = kind === "analysis" ? env().AI_DAILY_ANALYSIS_LIMIT : env().AI_DAILY_LIMIT_PER_USER;
  const { data, error } = await db().rpc("consume_ai", { p_user: userId, p_units: units, p_limit: limit, p_kind: kind });
  if (error) throw new Error(`consume_ai: ${error.message}`);
  if (data !== true) throw new QuotaExceededError(kind);
}
