"use client";

import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { postJson } from "@/lib/client";
import { PLATFORMS } from "./AddGameForm";

type Target = { kind: "member"; memberId: string } | { kind: "self"; platform: string };
type Result = { imported: number; unresolved: string[]; unresolvedCount: number; truncated: boolean };

/** CSV-Datei hochladen oder Liste einfügen – eine Zeile pro Spiel (Titel, Steam-AppID oder Store-Link). */
export function GameListImport({ target, onDone }: { target: Target; onDone?: () => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await postJson<Result>("/api/import", { text, target });
      setResult(r);
      setText("");
      setFileName(null);
      router.refresh();
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={file}
          type="file"
          accept=".csv,.txt,.tsv,text/csv,text/plain"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 300_000) return setError("Datei zu groß (max. 300 KB).");
            setFileName(f.name);
            setText(await f.text());
          }}
        />
        <button type="button" className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => file.current?.click()}>
          <FileUp size={14} /> CSV-Datei wählen
        </button>
        <span className="text-xs text-muted">{fileName ?? "oder Liste unten einfügen"}</span>
      </div>
      <textarea
        className="input min-h-28 font-mono text-xs"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setFileName(null);
        }}
        placeholder={"Eine Zeile pro Spiel – Titel, Steam-AppID oder Store-Link:\nHades\n1145360\nhttps://store.steampowered.com/app/413150\n\nOder CSV mit Spalte „title“ und/oder „appid“."}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy || !text.trim()} onClick={run}>
          {busy ? "Importiere … (kann bei vielen Titeln eine Minute dauern)" : "Importieren"}
        </button>
        {error && <span className="text-sm text-bad">{error}</span>}
      </div>
      {result && (
        <div className="space-y-1 text-sm">
          <p className="text-good">{result.imported} Spiele übernommen.</p>
          {result.truncated && <p className="text-muted">Es wurden nur die ersten 400 Zeilen gelesen – den Rest bitte in einem zweiten Schritt.</p>}
          {result.unresolvedCount > 0 && (
            <details className="text-muted">
              <summary className="cursor-pointer">{result.unresolvedCount} nicht eindeutig gefunden – mit Steam-AppID oder exaktem Titel nochmal versuchen</summary>
              <ul className="mt-1 ml-4 list-disc text-xs">
                {result.unresolved.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/** Eigene Spiele anderer Plattformen als Liste/CSV importieren. */
export function SelfImport() {
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  return (
    <details className="card group p-4">
      <summary className="cursor-pointer list-none text-sm font-medium">
        Viele auf einmal: Liste oder CSV importieren <span className="inline-block text-muted transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="imp-platform" className="text-muted">
            Plattform
          </label>
          <select id="imp-platform" className="input !w-auto !py-1.5" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <GameListImport target={{ kind: "self", platform }} />
      </div>
    </details>
  );
}
