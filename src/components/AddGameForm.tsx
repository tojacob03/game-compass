"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { postJson } from "@/lib/client";

type Hit = { appid: number; name: string; image: string };

export const PLATFORMS = ["PlayStation", "Xbox", "Switch", "GOG", "Epic", "Battle.net", "EA App", "Ubisoft", "Mobile", "Retro", "Sonstiges"];

export function AddGameForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [description, setDescription] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (picked || title.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/games?q=${encodeURIComponent(title.trim())}`, { signal: ctrl.signal });
        if (res.ok) setHits(((await res.json()) as { items: Hit[] }).items);
      } catch {
        /* abgebrochen */
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [title, picked]);

  const visibleHits = picked || title.trim().length < 2 ? [] : hits;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await postJson<{ id: string }>("/api/games", {
        title: picked?.name ?? title.trim(),
        steamAppid: picked?.appid,
        platform,
        description: description.trim() || undefined,
      });
      router.push(`/games/${r.id}`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Fehler");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <h2 className="h2">Spiel von einer anderen Plattform hinzufügen</h2>
      <div className="relative">
        <label className="label" htmlFor="title">
          Titel
        </label>
        <input
          id="title"
          className="input"
          value={picked?.name ?? title}
          onChange={(e) => {
            setPicked(null);
            setTitle(e.target.value);
          }}
          placeholder="z. B. The Legend of Zelda: Tears of the Kingdom"
          required
          maxLength={200}
          autoComplete="off"
        />
        {visibleHits.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface-2 shadow-xl">
            <div className="px-3 py-1.5 text-xs text-muted">Auch auf Steam? Dann bekommen wir bessere Daten:</div>
            {visibleHits.map((h) => (
              <button
                type="button"
                key={h.appid}
                onClick={() => {
                  setPicked(h);
                  setHits([]);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface"
              >
                <img src={h.image} alt="" className="h-6 w-14 rounded object-cover" />
                {h.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="platform">
            Plattform
          </label>
          <select id="platform" className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        {!picked && (
          <div>
            <label className="label" htmlFor="desc">
              Kurzbeschreibung (optional)
            </label>
            <input
              id="desc"
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="Hilft der KI bei unbekannten Spielen"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy}>
          {busy ? "Füge hinzu …" : "Hinzufügen & bewerten"}
        </button>
        {msg && <span className="text-sm text-bad">{msg}</span>}
      </div>
    </form>
  );
}
