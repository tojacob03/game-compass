"use client";

import { Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { postJson } from "@/lib/client";
import { GameListImport } from "./GameListImport";

export type Member = { id: string; name: string; steam_id: string | null; last_synced_at: string | null; sync_error: string | null; game_count: number };
type Hit = { appid: number; name: string; image: string };

/** Mitglieder der Steam-Familie ohne GameCompass-Konto: anlegen, Spiele per Steam-Profil, CSV oder einzeln. */
export function FamilyManager({ members, appMembers }: { members: Member[]; appMembers: string[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(members.length === 0);
  const [name, setName] = useState("");
  const [steam, setSteam] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; mode: "import" | "add" } | null>(null);

  async function act(key: string, body: unknown) {
    setBusy(key);
    setError(null);
    try {
      await postJson("/api/family", body);
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
      router.refresh();
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="h2">Wer ist in deiner Steam-Familie?</h2>
        <p className="text-sm text-muted">
          Niemand muss sich dafür anmelden. Am einfachsten über das Steam-Profil (wenn die Spieleliste öffentlich ist) – sonst per CSV
          oder einzeln eintragen.
          {appMembers.length > 0 && <> Mit eigenem Konto dabei: {appMembers.join(", ")}.</>}
        </p>
      </div>

      {members.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {members.map((m) => (
            <li key={m.id} className="space-y-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-muted">
                    {m.game_count} Spiele
                    {m.steam_id ? (m.last_synced_at ? ` · Steam geladen ${new Date(m.last_synced_at).toLocaleDateString("de-DE")}` : " · Steam-Profil hinterlegt") : " · ohne Steam-Profil"}
                  </div>
                  {m.sync_error && <div className="mt-1 text-xs text-bad">{m.sync_error}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {m.steam_id && (
                    <button className="btn-ghost !px-3 !py-1.5 !text-xs" disabled={!!busy} onClick={() => act(`sync-${m.id}`, { action: "sync", memberId: m.id })}>
                      <RefreshCw size={13} className={busy === `sync-${m.id}` ? "animate-spin" : ""} /> Von Steam laden
                    </button>
                  )}
                  <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => setOpen(open?.id === m.id && open.mode === "import" ? null : { id: m.id, mode: "import" })}>
                    CSV / Liste
                  </button>
                  <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => setOpen(open?.id === m.id && open.mode === "add" ? null : { id: m.id, mode: "add" })}>
                    <Plus size={13} /> Spiel
                  </button>
                  <button
                    className="grid h-7 w-7 place-items-center rounded-full border border-line text-muted transition hover:border-bad/60 hover:text-bad"
                    title={`${m.name} entfernen`}
                    aria-label={`${m.name} entfernen`}
                    disabled={!!busy}
                    onClick={() => confirm(`${m.name} samt eingetragener Spiele entfernen?`) && act(`rm-${m.id}`, { action: "remove", memberId: m.id })}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              {open?.id === m.id && open.mode === "import" && <GameListImport target={{ kind: "member", memberId: m.id }} />}
              {open?.id === m.id && open.mode === "add" && (
                <SteamGamePicker onPick={(h) => act(`add-${m.id}`, { action: "addGame", memberId: m.id, steamAppid: h.appid, title: h.name })} />
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act("add", { action: "add", name: name || undefined, steam: steam || undefined })) {
              setName("");
              setSteam("");
              setAdding(false);
            }
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (z. B. Lena)" maxLength={60} />
          <input className="input" value={steam} onChange={(e) => setSteam(e.target.value)} placeholder="Steam-Profil-Link oder SteamID (optional)" maxLength={200} />
          <button className="btn-primary" disabled={busy === "add" || (!name.trim() && !steam.trim())}>
            {busy === "add" ? "Lade …" : "Hinzufügen"}
          </button>
        </form>
      ) : (
        <button className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-text" onClick={() => setAdding(true)}>
          <UserPlus size={14} /> Familienmitglied hinzufügen
        </button>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </section>
  );
}

/** Steam-Store durchsuchen und ein Spiel auswählen. */
function SteamGamePicker({ onPick }: { onPick: (h: Hit) => Promise<boolean> | void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/games?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (res.ok) setHits(((await res.json()) as { items: Hit[] }).items);
      } catch {
        /* abgebrochen */
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className="space-y-2">
      <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Spiel auf Steam suchen …" />
      {q.trim().length >= 2 && hits.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          {hits.map((h) => (
            <button
              key={h.appid}
              type="button"
              onClick={async () => {
                if ((await onPick(h)) !== false) setAdded((a) => [...a, h.name]);
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-white/[0.05]"
            >
              <img src={h.image} alt="" className="h-6 w-14 rounded object-cover" />
              <span className="flex-1">{h.name}</span>
              {added.includes(h.name) ? <span className="text-xs text-good">hinzugefügt</span> : <Plus size={14} className="text-muted" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
