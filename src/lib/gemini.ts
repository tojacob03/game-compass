import "server-only";
import { ApiError, GoogleGenAI, type Content, type FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { env } from "./env";

export const EMBED_DIM = 768;

let client: GoogleGenAI | null = null;
export function gemini() {
  if (!client) client = new GoogleGenAI({ apiKey: env().GEMINI_API_KEY });
  return client;
}

/** Gemini-Kontingent (Free Tier) erschöpft – der Client soll später erneut versuchen. */
export class RateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super("Gemini-Ratelimit erreicht");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let delay = 2000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const retryable = status === 429 || status === 500 || status === 503;
      if (!retryable || attempt >= tries) {
        if (status === 429) throw new RateLimitError(30_000);
        throw err;
      }
      await sleep(delay);
      delay *= 2.5;
    }
  }
}

/**
 * Free-Tier-Modelle sind zeitweise überlastet (503) oder am Limit (429). Jedes Modell hat ein eigenes
 * Kontingent – daher nach den Retries auf das jeweils andere konfigurierte Modell ausweichen.
 */
async function withModelFallback<T>(primary: string, fn: (model: string) => Promise<T>): Promise<T> {
  const models = [...new Set([primary, env().GEMINI_MODEL, env().GEMINI_ANALYSIS_MODEL])];
  let lastErr: unknown;
  for (const model of models) {
    try {
      return await withRetry(() => fn(model), model === primary ? 3 : 2);
    } catch (err) {
      const fallbackWorthy = err instanceof RateLimitError || (err instanceof ApiError && [500, 503].includes(err.status));
      if (!fallbackWorthy) throw err;
      console.warn(`Gemini ${model} nicht verfügbar, versuche nächstes Modell`);
      lastErr = err;
    }
  }
  throw lastErr;
}

function jsonSchemaFor(schema: z.ZodType) {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/** Strukturierte Ausgabe: Gemini liefert JSON nach Schema, wir validieren zusätzlich mit zod. */
export async function generateJson<S extends z.ZodType>(
  schema: S,
  opts: { model?: string; system: string; prompt: string; temperature?: number },
): Promise<z.infer<S>> {
  const res = await withModelFallback(opts.model ?? env().GEMINI_MODEL, (model) =>
    gemini().models.generateContent({
      model,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        temperature: opts.temperature ?? 0.4,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchemaFor(schema),
      },
    }),
  );
  const text = res.text;
  if (!text) throw new Error("Leere Antwort von Gemini");
  return schema.parse(JSON.parse(text));
}

export async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100);
    const res = await withRetry(() =>
      gemini().models.embedContent({
        model: env().GEMINI_EMBED_MODEL,
        contents: chunk,
        config: { taskType: "SEMANTIC_SIMILARITY", outputDimensionality: EMBED_DIM },
      }),
    );
    const embs = res.embeddings ?? [];
    if (embs.length !== chunk.length) throw new Error("Embedding-Anzahl passt nicht");
    for (const e of embs) out.push(normalize(e.values ?? []));
  }
  return out;
}

function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

/** pgvector erwartet '[1,2,3]' */
export function toPgVector(v: number[]): string {
  return `[${v.map((x) => x.toFixed(6)).join(",")}]`;
}

export function parsePgVector(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[];
  if (typeof v === "string") return JSON.parse(v) as number[];
  return null;
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // Vektoren sind normalisiert
}

/** Ein Schritt im Chat mit Tools (Function Calling). */
export async function chatStep(opts: { system: string; contents: Content[]; tools: FunctionDeclaration[] }) {
  return withModelFallback(env().GEMINI_MODEL, (model) =>
    gemini().models.generateContent({
      model,
      contents: opts.contents,
      config: {
        systemInstruction: opts.system,
        temperature: 0.7,
        tools: opts.tools.length ? [{ functionDeclarations: opts.tools }] : undefined,
      },
    }),
  );
}
