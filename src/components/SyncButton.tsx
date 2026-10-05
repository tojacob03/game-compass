"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client";

export function SyncButton({ label = "Steam synchronisieren", variant = "primary" }: { label?: string; variant?: "primary" | "ghost" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await postJson<{ owned: number; wishlist: number }>("/api/sync");
      setMsg(`${r.owned} Spiele und ${r.wishlist} Wunschlisten-Einträge synchronisiert.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button className={variant === "ghost" ? "btn-ghost !px-3 !py-1.5 !text-xs" : "btn-primary"} onClick={sync} disabled={busy}>
        {busy ? "Synchronisiere …" : label}
      </button>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}
