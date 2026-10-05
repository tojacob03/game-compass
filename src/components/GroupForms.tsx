"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client";

export function GroupForms() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [family, setFamily] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function act(body: unknown, reset: () => void) {
    setMsg(null);
    try {
      await postJson("/api/groups", body);
      reset();
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Fehler");
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form
        className="card space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          act({ action: "create", name, isSteamFamily: family }, () => setName(""));
        }}
      >
        <h2 className="h2">Gruppe erstellen</h2>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Die Koop-Crew" required maxLength={60} />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={family} onChange={(e) => setFamily(e.target.checked)} className="mt-1 accent-[var(--accent)]" />
          <span>
            Das ist unsere <strong>Steam-Familie</strong>
            <span className="block text-xs text-muted">Dann zeigen wir die Spiele der anderen als „über Familie verfügbar“.</span>
          </span>
        </label>
        <button className="btn-primary">Erstellen</button>
      </form>
      <form
        className="card space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          act({ action: "join", code }, () => setCode(""));
        }}
      >
        <h2 className="h2">Gruppe beitreten</h2>
        <input className="input font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Einladungscode" required minLength={6} maxLength={32} />
        <button className="btn-primary">Beitreten</button>
        {msg && <p className="text-sm text-bad">{msg}</p>}
      </form>
    </div>
  );
}

export function LeaveGroupButton({ groupId }: { groupId: string }) {
  const router = useRouter();
  return (
    <button
      className="text-xs text-muted underline hover:text-bad"
      onClick={async () => {
        if (!confirm("Gruppe wirklich verlassen?")) return;
        await postJson("/api/groups", { action: "leave", groupId });
        router.refresh();
      }}
    >
      Verlassen
    </button>
  );
}
