import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;

/** Server-only Supabase client (Secret Key, umgeht RLS). Niemals an den Browser geben. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env().SUPABASE_URL, env().SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Wirft bei Supabase-Fehlern, damit Fehler nicht still verschluckt werden. */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Holt alle Zeilen seitenweise (Supabase liefert standardmäßig max. 1000 pro Request). */
export async function fetchAll<T>(build: (from: number, to: number) => PageResult<T>, what: string, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = must(await build(from, from + pageSize - 1), what) ?? [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

/** `.in(...)`-Abfragen in Stücken, damit die URL nicht zu lang wird. */
export async function selectInChunks<T>(ids: string[], build: (chunk: string[]) => PageResult<T>, what: string, size = 150): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) out.push(...(must(await build(ids.slice(i, i + size)), what) ?? []));
  return out;
}
