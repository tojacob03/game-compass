"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/client";
import type { QuickCard } from "@/lib/quickrate";
import { RebuildProfileButton } from "./ProfileActions";

type Verdict = "love" | "good" | "meh" | "bad" | "skip";
type Tone = "liked" | "disliked";

const VERDICTS: { v: Verdict; emoji: string; label: string; key: string }[] = [
  { v: "love", emoji: "❤️", label: "Liebe ich", key: "1" },
  { v: "good", emoji: "👍", label: "Gut", key: "2" },
  { v: "meh", emoji: "😐", label: "Meh", key: "3" },
  { v: "bad", emoji: "👎", label: "Nicht meins", key: "4" },
];

export function QuickRate() {
  const [cards, setCards] = useState<QuickCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [done, setDone] = useState(0);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [tones, setTones] = useState<Record<string, Tone>>({});
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const r = await postJson<{ cards: QuickCard[]; remaining: number }>("/api/quickrate", { action: "batch" });
      setError(null);
      setCards(r.cards);
      setRemaining(r.remaining);
      setIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
      setCards([]);
    } finally {
      loading.current = false;
    }
  }, []);

  // Erster Stapel: setState nur im Promise-Callback (nicht synchron im Effect)
  useEffect(() => {
    if (loading.current) return;
    loading.current = true;
    postJson<{ cards: QuickCard[]; remaining: number }>("/api/quickrate", { action: "batch" })
      .then((r) => {
        setCards(r.cards);
        setRemaining(r.remaining);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Fehler");
        setCards([]);
      })
      .finally(() => {
        loading.current = false;
      });
  }, []);

  const card = cards?.[index];

  const submit = useCallback(
    async (v: Verdict) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        const liked = Object.entries(tones).filter(([, t]) => t === "liked").map(([a]) => a);
        const disliked = Object.entries(tones).filter(([, t]) => t === "disliked").map(([a]) => a);
        await postJson("/api/quickrate", { action: "rate", gameId: card.gameId, verdict: v, liked, disliked, note: note.trim() || undefined });
        setDone((d) => d + 1);
        setVerdict(null);
        setTones({});
        setNote("");
        setShowNote(false);
        if (cards && index + 1 < cards.length) setIndex(index + 1);
        else await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Fehler");
      } finally {
        setBusy(false);
      }
    },
    [card, busy, tones, note, cards, index, load],
  );

  // Tastatur: 1-4 = Urteil, 5/S = nicht richtig gespielt, Enter = weiter
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const hit = VERDICTS.find((x) => x.key === e.key);
      if (hit) setVerdict(hit.v);
      if (e.key === "5" || e.key.toLowerCase() === "s") void submit("skip");
      if (e.key === "Enter" && verdict) void submit(verdict);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit, verdict]);

  function cycle(aspect: string, preferred: Tone) {
    setTones((t) => {
      const cur = t[aspect];
      const next: Tone | undefined = !cur ? preferred : cur === preferred ? (preferred === "liked" ? "disliked" : "liked") : undefined;
      const copy = { ...t };
      if (next) copy[aspect] = next;
      else delete copy[aspect];
      return copy;
    });
  }

  if (cards === null) return <RateSkeleton />;

  if (!card) {
    return (
      <div className="card mx-auto max-w-lg space-y-4 p-8 text-center">
        <div className="text-5xl">🎉</div>
        <h2 className="h2">{done ? `${done} Spiele bewertet – stark!` : "Alles bewertet"}</h2>
        <p className="text-muted">
          {done
            ? "Dein Profil wird mit den neuen Urteilen neu berechnet – inklusive deiner Spielmodi."
            : "Für alle gespielten Spiele liegt ein Urteil vor. Spiel mehr oder synchronisiere neu."}
        </p>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex flex-wrap justify-center gap-3">
          {done > 0 && <RebuildProfileButton label="Profil jetzt neu berechnen" />}
          <Link href="/dashboard" className="btn-ghost">
            Zur Übersicht
          </Link>
        </div>
      </div>
    );
  }

  const aspects = [...card.loved.map((a) => ({ a, tone: "liked" as Tone })), ...card.criticized.map((a) => ({ a, tone: "disliked" as Tone }))];
  const playedPct = card.typicalHours ? Math.min(100, Math.round((card.hours / card.typicalHours) * 100)) : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          {done > 0 ? `${done} erledigt · ` : ""}noch {Math.max(0, remaining - index)} offen
        </span>
        <span className="hidden sm:inline">Tasten 1–4 · S = überspringen · Enter = weiter</span>
      </div>
      <div className="h-1 overflow-hidden rounded bg-surface-2">
        <div className="h-full bg-accent transition-all" style={{ width: `${((index + (verdict ? 0.5 : 0)) / Math.max(1, cards.length)) * 100}%` }} />
      </div>

      <article className="card overflow-hidden">
        <div className="relative aspect-[460/215] bg-surface-2">
          {card.header_image && <img src={card.header_image} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-12">
            <h2 className="font-display text-2xl font-semibold text-white">{card.title}</h2>
            <p className="text-sm text-white/75">{card.hint}</p>
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          {card.hours > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted">
                <span>{card.hours} h gespielt</span>
                {card.typicalHours && <span>typisch ~{card.typicalHours} h</span>}
              </div>
              {playedPct !== null && (
                <div className="h-1.5 overflow-hidden rounded bg-surface-2">
                  <div className="h-full rounded bg-muted/60" style={{ width: `${Math.max(3, playedPct)}%` }} />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            {VERDICTS.map((x) => (
              <button
                key={x.v}
                onClick={() => setVerdict(x.v)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-3 text-xs transition ${
                  verdict === x.v ? "border-accent bg-accent/10 text-text" : "border-line bg-surface-2 text-muted hover:border-muted hover:text-text"
                }`}
              >
                <span className="text-2xl">{x.emoji}</span>
                {x.label}
              </button>
            ))}
          </div>

          {verdict && (
            <div className="space-y-3">
              {aspects.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm">
                    {verdict === "bad" || verdict === "meh" ? "Was hat gestört – oder war trotzdem gut?" : "Was hat's ausgemacht – und was hat genervt?"}
                    <span className="ml-1 text-xs text-muted">(antippen, nochmal = umkehren)</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {aspects.map(({ a, tone }) => {
                      const t = tones[a];
                      return (
                        <button
                          key={a}
                          onClick={() => cycle(a, verdict === "bad" ? "disliked" : tone)}
                          className={`rounded-full border px-3 py-1.5 text-sm transition ${
                            t === "liked"
                              ? "border-good bg-good/15 text-good"
                              : t === "disliked"
                                ? "border-bad bg-bad/15 text-bad"
                                : "border-line text-muted hover:border-muted hover:text-text"
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
              {showNote ? (
                <input
                  className="input"
                  autoFocus
                  value={note}
                  maxLength={1000}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit(verdict)}
                  placeholder="In eigenen Worten (optional) …"
                />
              ) : (
                <button className="text-xs text-muted underline hover:text-text" onClick={() => setShowNote(true)}>
                  + eigene Worte hinzufügen
                </button>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <button className="text-sm text-muted hover:text-text" disabled={busy} onClick={() => void submit("skip")}>
              Nicht richtig gespielt
            </button>
            <button className="btn-primary" disabled={!verdict || busy} onClick={() => verdict && void submit(verdict)}>
              {busy ? "…" : "Weiter →"}
            </button>
          </div>
          {error && <p className="text-sm text-bad">{error}</p>}
        </div>
      </article>
    </div>
  );
}

function RateSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
      <div className="card overflow-hidden">
        <div className="aspect-[460/215] animate-pulse bg-surface-2" />
        <div className="space-y-3 p-5">
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
          <p className="text-center text-xs text-muted">Suche die aufschlussreichsten Spiele heraus …</p>
        </div>
      </div>
    </div>
  );
}
