"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { postJson } from "@/lib/client";

type Verdict = "interested" | "not_interested" | "already_played";

export function FeedbackButtons({ gameId, initial }: { gameId: string; initial: Verdict | null }) {
  const [verdict, setVerdict] = useState<Verdict | null>(initial);
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(v: Verdict, r?: string) {
    setBusy(true);
    try {
      await postJson("/api/feedback", { gameId, verdict: v, reason: r || undefined });
      setVerdict(v);
      setAskReason(false);
    } finally {
      setBusy(false);
    }
  }

  if (verdict === "already_played") {
    return (
      <p className="text-sm text-muted">
        Notiert. <Link href={`/games/${gameId}`} className="text-accent underline">Jetzt bewerten</Link> – das schärft dein Profil am meisten.
      </p>
    );
  }
  if (verdict === "not_interested" && !askReason) {
    return <p className="text-sm text-muted">Verstanden – fließt in dein Profil ein.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          className={`btn-ghost !px-3 !py-1.5 !text-xs ${verdict === "interested" ? "!border-good/60 !text-good" : ""}`}
          disabled={busy}
          onClick={() => send("interested")}
        >
          <ThumbsUp size={14} strokeWidth={1.8} /> Klingt gut
        </button>
        <button className="btn-ghost !px-3 !py-1.5 !text-xs" disabled={busy} onClick={() => setAskReason(true)}>
          <ThumbsDown size={14} strokeWidth={1.8} /> Eher nicht
        </button>
        <button className="btn-ghost !px-3 !py-1.5 !text-xs" disabled={busy} onClick={() => send("already_played")}>
          Schon gespielt
        </button>
      </div>
      {askReason && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            placeholder="Warum nicht? (optional, aber Gold wert – z. B. 'zu viel Kampf', 'Pixel-Look mag ich nicht')"
            autoFocus
          />
          <button className="btn-primary shrink-0" disabled={busy} onClick={() => send("not_interested", reason)}>
            Senden
          </button>
        </div>
      )}
    </div>
  );
}
