"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client";

export function AdminUserActions({ userId, status }: { userId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function set(s: string) {
    setBusy(true);
    try {
      await postJson("/api/admin/users", { userId, status: s });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-2">
      {status !== "active" && (
        <button className="btn-primary !px-3 !py-1" disabled={busy} onClick={() => set("active")}>
          Freischalten
        </button>
      )}
      {status !== "blocked" && (
        <button className="btn-ghost !px-3 !py-1" disabled={busy} onClick={() => set("blocked")}>
          Sperren
        </button>
      )}
    </div>
  );
}
