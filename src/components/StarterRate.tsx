"use client";

import { Heart, Meh, Search, ThumbsDown, ThumbsUp } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/client";
import type { StarterCard } from "@/lib/starter";
import { RebuildProfileButton } from "./ProfileActions";
import { GameImage } from "./ui/GameImage";

type Verdict = "love" | "good" | "meh" | "bad" | "skip";
const BUTTONS: { v: Verdict; Icon: typeof Heart; label: string }[] = [
  { v: "love", Icon: Heart, label: "Liebe ich" },
  { v: "good", Icon: ThumbsUp, label: "Gut" },
  { v: "meh", Icon: Meh, label: "Meh" },
  { v: "bad", Icon: ThumbsDown, label: "Nicht meins" },
];

/**
 * Starter-Runde: bekannte, möglichst unterschiedliche Spiele bewerten – egal auf welcher Plattform gespielt.
 * Für alle mit wenig oder keinen Steam-Spielen.
 */
export function StarterRate({ initialSignals, target }: { initialSignals: number; target: number }) {
  const [cards, setCards] = useState<StarterCard[] | null>(null);
  const [rated, setRated] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);
  const signals = initialSignals + rated;

  const loadMore = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const r = await postJson<{ cards: StarterCard[] }>("/api/quickrate", { action: "starterBatch" });
      setCards((cur) => {
        const have = new Set((cur ?? []).map((c) => c.gameId));
        return [...(cur ?? []), ...r.cards.filter((c) => !have.has(c.gameId))];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
      setCards((cur) => cur ?? []);
    } finally {
      loading.current = false;
    }
  }, []);

  // Erster Stapel: setState nur im Promise-Callback (nicht synchron im Effect)
  useEffect(() => {
    if (loading.current) return;
    loading.current = true;
    postJson<{ cards: StarterCard[] }>("/api/quickrate", { action: "starterBatch" })
      .then((r) => setCards(r.cards))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Fehler");
        setCards([]);
      })
      .finally(() => {
        loading.current = false;
      });
  }, []);

  async function rate(card: StarterCard, v: Verdict) {
    setCards((cur) => (cur ?? []).filter((c) => c.gameId !== card.gameId));
    if (v !== "skip") setRated((n) => n + 1);
    try {
      await postJson("/api/quickrate", { action: "starterRate", gameId: card.gameId, verdict: v });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
    }
    if ((cards?.length ?? 0) <= 5) void loadMore();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl space-y-1">
          <h2 className="h2">Spiele, die du kennst</h2>
          <p className="text-sm text-muted">
            Egal ob auf Konsole, bei Freunden oder vor Jahren gespielt – ein Tipp pro Spiel. Die Auswahl ist bewusst bunt gemischt,
            damit jede Antwort viel über dich verrät. Was du nicht kennst: „Kenne ich nicht“.
          </p>
        </div>
        <div className="w-full max-w-56 space-y-1.5">
          <div className="flex justify-between text-xs text-muted">
            <span>{signals} Spiele mit Urteil</span>
            <span>Ziel {target}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${Math.min(100, (signals / target) * 100)}%` }} />
          </div>
        </div>
      </div>

      <FavoriteSearch onCard={(c) => setCards((cur) => [c, ...(cur ?? []).filter((x) => x.gameId !== c.gameId)])} />

      {signals >= 3 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white/[0.03] p-3 text-sm">
          <span className="text-muted">
            {signals >= target ? "Genug für ein gutes erstes Profil." : "Ein erstes Profil geht schon – je mehr Urteile, desto genauer."}
          </span>
          <RebuildProfileButton label="Profil erstellen" />
        </div>
      )}

      {cards === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {cards.slice(0, 12).map((c) => (
              <motion.div
                key={c.gameId}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className="card flex flex-col overflow-hidden"
              >
                <GameImage src={c.image ?? c.header} fallbackSrc={c.header} title={c.title} className="aspect-[2/3]" />
                <div className="flex flex-1 flex-col gap-2 p-2.5">
                  <div className="min-h-10">
                    <div className="line-clamp-2 text-sm font-medium leading-snug">{c.title}</div>
                    {c.year && <div className="text-xs text-muted">{c.year}</div>}
                  </div>
                  <div className="mt-auto grid grid-cols-4 gap-1">
                    {BUTTONS.map(({ v, Icon, label }) => (
                      <motion.button
                        key={v}
                        whileTap={{ scale: 0.88 }}
                        title={label}
                        aria-label={`${c.title}: ${label}`}
                        onClick={() => rate(c, v)}
                        className="grid h-9 place-items-center rounded-lg border border-line text-muted transition hover:border-line-strong hover:text-text"
                      >
                        <Icon size={16} strokeWidth={1.7} />
                      </motion.button>
                    ))}
                  </div>
                  <button className="text-xs text-muted transition hover:text-text" onClick={() => rate(c, "skip")}>
                    Kenne ich nicht
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {cards.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted">Gerade keine weiteren Vorschläge – such oben nach deinen Lieblingsspielen.</p>}
        </div>
      )}
      {error && <p className="text-sm text-bad">{error}</p>}
    </div>
  );
}

type Hit = { appid: number; name: string; image: string };

/** Eigene Lieblingsspiele suchen und als Karte oben einreihen. */
function FavoriteSearch({ onCard }: { onCard: (c: StarterCard) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);

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
    <div className="relative max-w-xl">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input className="input !pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lieblingsspiel suchen (alles, was es auch auf Steam gibt) …" />
      {q.trim().length >= 2 && hits.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface-2 shadow-xl">
          {hits.map((h) => (
            <button
              key={h.appid}
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await postJson<{ card: StarterCard | null }>("/api/quickrate", { action: "starterAdd", steamAppid: h.appid, title: h.name });
                  if (r.card) onCard(r.card);
                  setQ("");
                  setHits([]);
                } finally {
                  setBusy(false);
                }
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
  );
}
