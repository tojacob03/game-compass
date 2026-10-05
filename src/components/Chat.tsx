"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { postJson } from "@/lib/client";
import { Markdown } from "./Markdown";

type Msg = { role: "user" | "model"; text: string; cards?: Card[] };
type Card = { id: string; title: string; header_image: string | null };

const STORAGE_KEY = "gc_chat_v1";
const STARTERS = [
  "Ich hab heute 2 Stunden und bin müde – was aus meinem Backlog?",
  "Was Neues, das sich anfühlt wie meine Lieblingsspiele, aber in einem ganz anderen Genre?",
  "Welches Spiel aus der Steam-Familie passt gerade zu mir?",
  "Warum würde mir Disco Elysium gefallen – oder nicht?",
];

/** Nur im Browser rendern (siehe ChatClient), da der Verlauf aus localStorage kommt. */
export default function Chat({ userName }: { userName: string }) {
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as Msg[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignorieren */
    }
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const next: Msg[] = [...messages, { role: "user", text: t }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const r = await postJson<{ reply: string; cards: Card[] }>("/api/chat", {
        messages: next.slice(-20).map(({ role, text }) => ({ role, text: text.slice(0, 4000) })),
      });
      setMessages([...next, { role: "model", text: r.reply, cards: r.cards }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler");
      setMessages(messages);
      setInput(t);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="card space-y-4 p-6">
            <p className="font-display text-2xl">Hey {userName}, worauf hast du Lust?</p>
            <p className="text-sm text-muted">
              Ich kenne deine Bibliothek, dein Geschmacksprofil und kann neue Spiele nachschlagen. Ein paar Ideen:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button key={s} className="btn-ghost !justify-start text-left" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                m.role === "user" ? "bg-accent text-accent-ink" : "card"
              }`}
            >
              {m.role === "user" ? <p className="whitespace-pre-wrap">{m.text}</p> : <Markdown text={m.text} />}
              {m.cards && m.cards.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.cards.map((c) => (
                    <Link key={c.id} href={`/games/${c.id}`} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-1.5 pr-3 text-xs hover:border-accent">
                      {c.header_image && <img src={c.header_image} alt="" className="h-7 w-16 rounded object-cover" />}
                      {c.title}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="card inline-block px-4 py-3 text-sm text-muted">Compass denkt nach …</div>}
        <div ref={bottom} />
      </div>
      {error && <p className="mb-2 text-sm text-bad">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Frag nach Empfehlungen, Backlog-Tipps, einem bestimmten Spiel …"
          maxLength={4000}
        />
        <button className="btn-primary" disabled={busy || !input.trim()}>
          Senden
        </button>
        {messages.length > 0 && (
          <button type="button" className="btn-ghost" onClick={() => setMessages([])} disabled={busy}>
            Neu
          </button>
        )}
      </form>
    </div>
  );
}
