import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { RateLimitError } from "./gemini";
import { HttpError } from "./session";
import { QuotaExceededError } from "./usage";

/** Einheitliche Fehlerbehandlung für API-Routen – ohne interne Details nach außen zu geben. */
export function handleApiError(err: unknown) {
  if (err instanceof QuotaExceededError) {
    return NextResponse.json({ error: err.message, quota: err.kind }, { status: 429 });
  }
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof RateLimitError) {
    return NextResponse.json(
      { error: "Die KI ist gerade ausgelastet (Free-Tier-Limit). Versuch es gleich nochmal.", retryAfterMs: err.retryAfterMs },
      { status: 429 },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Ungültige Eingabe", issues: err.issues.map((i) => i.message) }, { status: 400 });
  }
  console.error(err);
  return NextResponse.json({ error: "Interner Fehler" }, { status: 500 });
}
