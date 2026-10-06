"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { postJson } from "@/lib/client";
import { VERDICT_LABEL, VERDICT_SCORE, type RatingVerdict } from "@/lib/verdicts";
import { VerdictPicker } from "./VerdictPicker";

type Verdict = "interested" | "not_interested" | "already_played";

/** Ein Tipp statt Tippen: häufige Gründe als Bausteine, frei ergänzbar. */
const REASONS = ["Thema/Setting reizt mich nicht", "Spielgefühl passt nicht", "Optik spricht mich nicht an", "Zu großer Zeitaufwand", "Gerade nicht in Stimmung"];

export function FeedbackButtons({ gameId, initial }: { gameId: string; initial: Verdict | null }) {
  const [verdict, setVerdict] = useState<Verdict | null>(initial);
  const [askReason, setAskReason] = useState(false);
  const [rating, setRating] = useState(false);
  const [rated, setRated] = useState<RatingVerdict | null>(null);
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

  /** "Schon gespielt" direkt hier bewerten – gleiche Skala wie überall, landet in der Bibliothek. */
  async function rate(v: RatingVerdict | null) {
    if (!v) return;
    setBusy(true);
    try {
      await postJson(`/api/games/${gameId}`, { score: VERDICT_SCORE[v], loved: null, disliked: null, status: null });
      await postJson("/api/feedback", { gameId, verdict: "already_played" });
      setRated(v);
      setVerdict("already_played");
    } finally {
      setBusy(false);
    }
  }

  if (rated) {
    return (
      <p className="text-sm text-muted">
        Als „{VERDICT_LABEL[rated]}“ gespeichert.{" "}
        <Link href={`/games/${gameId}`} className="text-accent underline">
          Details ergänzen
        </Link>
      </p>
    );
  }
  if (rating) {
    return (
      <div className="w-full max-w-sm space-y-2">
        <p className="text-sm">Wie war&apos;s?</p>
        <VerdictPicker value={null} onChange={rate} compact disabled={busy} />
        <button className="text-xs text-muted hover:text-text" onClick={() => setRating(false)}>
          Abbrechen
        </button>
      </div>
    );
  }
  if (verdict === "already_played") {
    return <p className="text-sm text-muted">Als „schon gespielt“ vermerkt.</p>;
  }
  if (verdict === "not_interested" && !askReason) {
    return <p className="text-sm text-muted">Verstanden – Ähnliches rutscht in der nächsten Runde nach unten.</p>;
  }

  return (
    <div className="w-full space-y-2">
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
        <button className="btn-ghost !px-3 !py-1.5 !text-xs" disabled={busy} onClick={() => setRating(true)}>
          Schon gespielt
        </button>
      </div>
      {askReason && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => {
              const on = reason.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() =>
                    setReason((cur) =>
                      on
                        ? cur.split("; ").filter((x) => x !== r).join("; ")
                        : [cur.trim(), r].filter(Boolean).join("; "),
                    )
                  }
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${on ? "border-bad/60 bg-bad/10 text-text" : "border-line text-muted hover:text-text"}`}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              placeholder="Oder in eigenen Worten (optional) – z. B. 'zu viel Kampf', 'Pixel-Look mag ich nicht'"
              onKeyDown={(e) => e.key === "Enter" && send("not_interested", reason)}
            />
            <button className="btn-primary shrink-0" disabled={busy} onClick={() => send("not_interested", reason)}>
              Senden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
