"use client";

import { Check, Heart, Meh, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/client";
import type { QuickCard } from "@/lib/quickrate";
import { GameImage } from "./ui/GameImage";

type Verdict = "love" | "good" | "meh" | "bad" | "skip";
type Tone = "liked" | "disliked";

const VERDICTS: { v: Verdict; Icon: typeof Heart; label: string; key: string }[] = [
  { v: "love", Icon: Heart, label: "Liebe ich", key: "1" },
  { v: "good", Icon: ThumbsUp, label: "Gut", key: "2" },
  { v: "meh", Icon: Meh, label: "Meh", key: "3" },
  { v: "bad", Icon: ThumbsDown, label: "Nicht meins", key: "4" },
];

/** Richtung, in die eine Karte nach dem Urteil herausfliegt. */
const EXIT: Record<Verdict, { x: number; y: number; rotate: number }> = {
  love: { x: 0, y: -600, rotate: 0 },
  good: { x: 600, y: 40, rotate: 18 },
  meh: { x: 0, y: 500, rotate: 0 },
  bad: { x: -600, y: 40, rotate: -18 },
  skip: { x: 0, y: 500, rotate: 0 },
};

const SWIPE = 110;

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
  const [exit, setExit] = useState<Verdict>("skip");
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
      setExit(v);
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

  // Tastatur: 1-4 = Urteil, S = nicht richtig gespielt, Enter = weiter, ←/→ = schnell
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const hit = VERDICTS.find((x) => x.key === e.key);
      if (hit) setVerdict(hit.v);
      if (e.key === "5" || e.key.toLowerCase() === "s") void submit("skip");
      if (e.key === "ArrowRight") void submit("good");
      if (e.key === "ArrowLeft") void submit("bad");
      if (e.key === "ArrowUp") void submit("love");
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
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="card mx-auto max-w-lg space-y-4 p-8 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220 }}
          className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-ink"
        >
          <Check size={26} strokeWidth={2.2} />
        </motion.div>
        <h2 className="h2">{done ? `${done} Spiele bewertet – stark!` : "Alles bewertet"}</h2>
        <p className="text-muted">
          {done
            ? "Deine Urteile wirken sofort aufs Ranking. Deine Spielmodi werden bei der nächsten Empfehlungsrunde automatisch nachgeschärft."
            : "Für alle gespielten Spiele liegt ein Urteil vor. Spiel mehr oder synchronisiere neu."}
        </p>
        {error && <p className="text-sm text-bad">{error}</p>}
        <div className="flex flex-col items-center gap-3">
          <Link href="/recommendations" className="btn-primary">
            Neue Empfehlungen holen
          </Link>
          <Link href="/profile" className="text-sm text-muted transition hover:text-text">
            Oder Geschmack feinjustieren →
          </Link>
        </div>
      </motion.div>
    );
  }

  const next = cards[index + 1];

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>
          {done > 0 ? `${done} erledigt · ` : ""}noch {Math.max(0, remaining - index)} offen
        </span>
        <span className="hidden font-mono text-[11px] sm:inline">← nö · ↑ liebe · gut →</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-accent"
          animate={{ width: `${((index + (verdict ? 0.5 : 0)) / Math.max(1, cards.length)) * 100}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>

      <div className="relative">
        {/* nächste Karte schimmert dahinter durch */}
        {next && (
          <div aria-hidden className="absolute inset-x-6 top-3 -z-10 h-full scale-[0.96] overflow-hidden rounded-2xl opacity-50">
            <GameImage src={next.header_image} title={next.title} className="aspect-[460/215] rounded-2xl blur-[2px]" />
          </div>
        )}
        <AnimatePresence mode="popLayout" custom={exit}>
          <SwipeCard
            key={card.gameId}
            card={card}
            exit={EXIT[exit]}
            disabled={busy || verdict !== null}
            onSwipe={(v) => void submit(v)}
          >
            <div className="space-y-5 p-4 sm:p-5">
              {card.hours > 0 && <PlaytimeBar hours={card.hours} typical={card.typicalHours} />}

              <div className="grid grid-cols-4 gap-2">
                {VERDICTS.map((x) => (
                  <motion.button
                    key={x.v}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setVerdict(x.v)}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-3 text-xs transition ${
                      verdict === x.v ? "border-text/50 bg-white/[0.06] text-text" : "border-line text-muted hover:border-line-strong hover:text-text"
                    }`}
                  >
                    <x.Icon size={22} strokeWidth={1.6} className={verdict === x.v ? "text-accent" : ""} fill={verdict === x.v && x.v === "love" ? "currentColor" : "none"} />
                    {x.label}
                  </motion.button>
                ))}
              </div>

              <AnimatePresence initial={false}>
                {verdict && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-3 overflow-hidden"
                  >
                    <Aspects card={card} verdict={verdict} tones={tones} onCycle={cycle} />
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
                  </motion.div>
                )}
              </AnimatePresence>

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
          </SwipeCard>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Ziehbare Karte: rechts = gut, links = nicht meins, hoch = liebe ich. */
function SwipeCard({
  card,
  exit,
  disabled,
  onSwipe,
  children,
}: {
  card: QuickCard;
  exit: { x: number; y: number; rotate: number };
  disabled: boolean;
  onSwipe: (v: Verdict) => void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-14, 14]);
  const likeOpacity = useTransform(x, [30, SWIPE], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE, -30], [1, 0]);
  const loveOpacity = useTransform(y, [-SWIPE, -30], [1, 0]);

  function onDragEnd(_: unknown, info: PanInfo) {
    const { offset, velocity } = info;
    if (offset.y < -SWIPE || velocity.y < -700) onSwipe("love");
    else if (offset.x > SWIPE || velocity.x > 700) onSwipe("good");
    else if (offset.x < -SWIPE || velocity.x < -700) onSwipe("bad");
  }

  return (
    <motion.article
      className="card relative cursor-grab overflow-hidden shadow-2xl shadow-black/50 active:cursor-grabbing"
      style={{ x, y, rotate }}
      drag={disabled || reduce ? false : true}
      dragSnapToOrigin
      dragElastic={0.6}
      onDragEnd={onDragEnd}
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ ...exit, opacity: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
    >
      <div className="relative">
        <GameImage
          src={card.header_image}
          title={card.title}
          className="aspect-[460/215] pointer-events-none"
          priority
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-14">
          <h2 className="font-display text-2xl font-semibold text-white">{card.title}</h2>
          <p className="text-sm text-white/75">{card.hint}</p>
        </div>
        <motion.span style={{ opacity: likeOpacity }} className="absolute left-4 top-4 -rotate-12 rounded-md border-2 border-good px-3 py-0.5 font-mono text-sm font-semibold uppercase tracking-[0.2em] text-good">
          Gut
        </motion.span>
        <motion.span style={{ opacity: nopeOpacity }} className="absolute right-4 top-4 rotate-12 rounded-md border-2 border-bad px-3 py-0.5 font-mono text-sm font-semibold uppercase tracking-[0.2em] text-bad">
          Nö
        </motion.span>
        <motion.span style={{ opacity: loveOpacity }} className="absolute left-1/2 top-4 -translate-x-1/2 rounded-md border-2 border-accent px-3 py-0.5 font-mono text-sm font-semibold uppercase tracking-[0.2em] text-accent">
          Liebe
        </motion.span>
      </div>
      {children}
    </motion.article>
  );
}

function PlaytimeBar({ hours, typical }: { hours: number; typical: number | null }) {
  const pct = typical ? Math.min(100, Math.round((hours / typical) * 100)) : null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted">
        <span>{hours} h gespielt</span>
        {typical && <span>typisch ~{typical} h</span>}
      </div>
      {pct !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-muted/50 to-muted"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(3, pct)}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      )}
    </div>
  );
}

function Aspects({
  card,
  verdict,
  tones,
  onCycle,
}: {
  card: QuickCard;
  verdict: Verdict;
  tones: Record<string, Tone>;
  onCycle: (a: string, t: Tone) => void;
}) {
  const aspects = [...card.loved.map((a) => ({ a, tone: "liked" as Tone })), ...card.criticized.map((a) => ({ a, tone: "disliked" as Tone }))];
  if (!aspects.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm">
        {verdict === "bad" || verdict === "meh" ? "Was hat gestört – oder war trotzdem gut?" : "Was hat's ausgemacht – und was hat genervt?"}
        <span className="ml-1 text-xs text-muted">(antippen, nochmal = umkehren)</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {aspects.map(({ a, tone }, i) => {
          const t = tones[a];
          return (
            <motion.button
              key={a}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => onCycle(a, verdict === "bad" ? "disliked" : tone)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                t === "liked" ? "border-good bg-good/15 text-good" : t === "disliked" ? "border-bad bg-bad/15 text-bad" : "border-line text-muted hover:border-line-strong hover:text-text"
              }`}
            >
              {t === "liked" ? "＋ " : t === "disliked" ? "− " : ""}
              {a}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function RateSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
      <div className="card overflow-hidden">
        <div className="aspect-[460/215] animate-shimmer bg-[linear-gradient(90deg,var(--surface-2),var(--surface),var(--surface-2))] bg-[length:200%_100%]" />
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
