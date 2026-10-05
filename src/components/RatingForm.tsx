"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client";

type Status = "backlog" | "playing" | "finished" | "dropped" | null;

export function RatingForm({
  gameId,
  initial,
  aspects,
}: {
  gameId: string;
  initial: { score: number | null; loved: string | null; disliked: string | null; status: Status; liked: string[]; dislikedAspects: string[] };
  aspects: { loved: string[]; criticized: string[] } | null;
}) {
  const [tones, setTones] = useState<Record<string, "liked" | "disliked">>(() => ({
    ...Object.fromEntries(initial.liked.map((a) => [a, "liked" as const])),
    ...Object.fromEntries(initial.dislikedAspects.map((a) => [a, "disliked" as const])),
  }));
  const allAspects = [...new Set([...(aspects?.loved ?? []), ...(aspects?.criticized ?? []), ...initial.liked, ...initial.dislikedAspects])];
  const router = useRouter();
  const [score, setScore] = useState<number | null>(initial.score);
  const [loved, setLoved] = useState(initial.loved ?? "");
  const [disliked, setDisliked] = useState(initial.disliked ?? "");
  const [status, setStatus] = useState<Status>(initial.status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await postJson(`/api/games/${gameId}`, {
        score,
        loved: loved || null,
        disliked: disliked || null,
        status,
        likedAspects: Object.entries(tones).filter(([, t]) => t === "liked").map(([a]) => a),
        dislikedAspects: Object.entries(tones).filter(([, t]) => t === "disliked").map(([a]) => a),
      });
      setMsg("Gespeichert – dein Geschmacksprofil wird beim nächsten Mal aktualisiert.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="label">Wertung</span>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setScore(score === n ? null : n)}
              className={`h-9 w-9 rounded-md border text-sm font-semibold transition ${
                score === n ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface-2 hover:border-muted"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      {allAspects.length > 0 && (
        <div>
          <span className="label">Aspekte (antippen: ＋ gepackt, nochmal: − gestört)</span>
          <div className="flex flex-wrap gap-2">
            {allAspects.map((a) => {
              const t = tones[a];
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() =>
                    setTones((cur) => {
                      const copy = { ...cur };
                      if (!cur[a]) copy[a] = "liked";
                      else if (cur[a] === "liked") copy[a] = "disliked";
                      else delete copy[a];
                      return copy;
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    t === "liked" ? "border-good bg-good/15 text-good" : t === "disliked" ? "border-bad bg-bad/15 text-bad" : "border-line text-muted hover:text-text"
                  }`}
                >
                  {t === "liked" ? "＋ " : t === "disliked" ? "− " : ""}
                  {a}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div>
        <label className="label" htmlFor="loved">
          Was hat dich gepackt?
        </label>
        <textarea
          id="loved"
          className="input min-h-24"
          value={loved}
          onChange={(e) => setLoved(e.target.value)}
          maxLength={2000}
          placeholder="z. B. dass ich die Welt selbst entschlüsseln musste, ohne Questmarker; das Gefühl von Einsamkeit im All …"
        />
      </div>
      <div>
        <label className="label" htmlFor="disliked">
          Was hat dich gestört?
        </label>
        <textarea
          id="disliked"
          className="input min-h-20"
          value={disliked}
          onChange={(e) => setDisliked(e.target.value)}
          maxLength={2000}
          placeholder="z. B. Backtracking im Endgame, zu viel Text-Lore, das Kampfsystem …"
        />
      </div>
      <div>
        <span className="label">Status</span>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["backlog", "Backlog"],
              ["playing", "Spiele ich"],
              ["finished", "Durch"],
              ["dropped", "Abgebrochen"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatus(status === v ? null : v)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                status === v ? "border-accent text-accent" : "border-line text-muted hover:border-muted"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy}>
          {busy ? "Speichere …" : "Speichern"}
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
      <p className="text-xs text-muted">
        Tipp: Die Freitexte sind das wichtigste Signal. Je konkreter („die Momente, in denen …“), desto besser die Empfehlungen.
      </p>
    </div>
  );
}
