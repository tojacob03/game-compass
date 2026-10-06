"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client";
import { JobControl } from "./jobs";

export function AboutMeForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await postJson("/api/profile", { action: "about", aboutMe: text });
      setMsg("Gespeichert – fließt bei der nächsten Empfehlungsrunde ein.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="label" htmlFor="about">
        Was sonst noch zählt – in deinen Worten
      </label>
      <p className="-mt-1 mb-2 text-xs text-muted">Wann und wie du spielst, was du generell suchst oder meidest. Wird beim Ableiten deiner Modi berücksichtigt.</p>
      <textarea
        id="about"
        className="input min-h-28"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={3000}
        placeholder="z. B. Ich liebe Spiele, die mich ratlos machen und mir dann den Aha-Moment schenken. Grind und Ubisoft-Türme hasse ich. Spiele meist abends 1–2 Stunden, am Wochenende Koop mit Freunden."
      />
      <div className="flex items-center gap-3">
        <button className="btn-ghost" onClick={save} disabled={busy}>
          Speichern
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}

/** Profil neu berechnen – als Server-Job, läuft auch weiter, wenn die Seite gewechselt wird. */
export function RebuildProfileButton({ label }: { label: string }) {
  return <JobControl kind="profile" label={label} />;
}

type EvalResult = {
  poolSize: number;
  holdout: string[];
  results: { method: string; recallAt10: number; recallAt25: number; mrr: number; meanPercentile: number; ranks: number[] }[];
};

const METHOD_LABEL: Record<string, string> = {
  personal: "GameCompass (Facetten + deine Spiele + Gewichte)",
  essence: "Nur Such-Facetten (vorheriges Ranking)",
  tags: "Klassisch: Tag-Ähnlichkeit",
  popularity: "Nur Beliebtheit",
};

export function EvalRunner() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await postJson<EvalResult>("/api/eval"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button className="btn-ghost" onClick={run} disabled={busy}>
        {busy ? "Teste …" : "Selbsttest starten"}
      </button>
      {error && <p className="text-sm text-bad">{error}</p>}
      {result && (
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            Versteckt: <span className="text-text">{result.holdout.join(", ")}</span> – gemischt unter {result.poolSize} Spiele.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-xs uppercase text-muted">
                <tr>
                  <th className="py-1 pr-4">Methode</th>
                  <th className="py-1 pr-4">Treffer Top 10</th>
                  <th className="py-1 pr-4">Treffer Top 25</th>
                  <th className="py-1 pr-4">Ø Perzentil</th>
                  <th className="py-1">Ränge</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.method} className="border-t border-line">
                    <td className="py-1.5 pr-4">{METHOD_LABEL[r.method] ?? r.method}</td>
                    <td className="py-1.5 pr-4">{pct(r.recallAt10)}</td>
                    <td className="py-1.5 pr-4">{pct(r.recallAt25)}</td>
                    <td className="py-1.5 pr-4">{pct(r.meanPercentile)}</td>
                    <td className="py-1.5 text-muted">{r.ranks.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">
            Ein einzelner Lauf ist verrauscht – mehrmals testen. Aussagekräftiger wird es, je größer der Katalog ist.
          </p>
        </div>
      )}
    </div>
  );
}
