export class ClientApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterMs?: number,
    public quota?: "analysis" | "interactive",
  ) {
    super(message);
  }
}

export async function postJson<T = unknown>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; retryAfterMs?: number; quota?: "analysis" | "interactive" };
  if (!res.ok) throw new ClientApiError(data.error ?? `Fehler ${res.status}`, res.status, data.retryAfterMs, data.quota);
  return data as T;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
