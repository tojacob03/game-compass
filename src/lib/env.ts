import "server-only";
import { z } from "zod";

const schema = z.object({
  APP_URL: z.url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET muss mindestens 32 Zeichen haben"),
  STEAM_API_KEY: z.string().min(10),
  SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash"),
  GEMINI_ANALYSIS_MODEL: z.string().default("gemini-3.5-flash-lite"),
  GEMINI_EMBED_MODEL: z.string().default("gemini-embedding-001"),
  ADMIN_STEAM_IDS: z.string().default(""),
  AI_DAILY_LIMIT_PER_USER: z.coerce.number().int().positive().default(150),
  AI_DAILY_ANALYSIS_LIMIT: z.coerce.number().int().positive().default(600),
  STEAM_COUNTRY: z.string().length(2).default("DE"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) {
    // Die Vercel-Supabase-Integration setzt SUPABASE_SERVICE_ROLE_KEY statt SUPABASE_SECRET_KEY – beides akzeptieren
    const parsed = schema.safeParse({
      ...process.env,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    });
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Ungültige oder fehlende Umgebungsvariablen: ${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function adminSteamIds(): Set<string> {
  return new Set(
    env()
      .ADMIN_STEAM_IDS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}
