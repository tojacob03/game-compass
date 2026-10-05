"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { postJson } from "@/lib/client";

type Item = { kind: "driver" | "aversion"; modeKey: string | null; name: string };

/** ✓ / ✕ an einem Profil-Eintrag. "Stimmt nicht" blendet ihn sofort aus – auch für Empfehlungen und Chat. */
export function CorrectionButtons({ item, confirmed }: { item: Item; confirmed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [isConfirmed, setConfirmed] = useState(confirmed);

  async function send(verdict: "confirm" | "reject") {
    if (verdict === "confirm" && isConfirmed) {
      setConfirmed(false);
      await postJson("/api/profile", { action: "uncorrect", ...item });
      return;
    }
    if (verdict === "confirm") setConfirmed(true);
    await postJson("/api/profile", { action: "correct", ...item, verdict });
    if (verdict === "reject") start(() => router.refresh());
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <motion.button
        whileTap={{ scale: 0.85 }}
        title={isConfirmed ? "Bestätigt – nochmal klicken zum Aufheben" : "Stimmt"}
        aria-label="Stimmt"
        disabled={pending}
        onClick={() => send("confirm")}
        className={`grid h-6 w-6 place-items-center rounded-full border text-xs transition ${
          isConfirmed ? "border-good bg-good/20 text-good" : "border-line text-muted hover:border-good/60 hover:text-good"
        }`}
      >
        ✓
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.85 }}
        title="Stimmt nicht – ausblenden"
        aria-label="Stimmt nicht"
        disabled={pending}
        onClick={() => send("reject")}
        className="grid h-6 w-6 place-items-center rounded-full border border-line text-xs text-muted transition hover:border-bad/60 hover:text-bad"
      >
        ✕
      </motion.button>
    </span>
  );
}

/** Liste ausgeblendeter Einträge mit "Wiederherstellen". */
export function RejectedList({ items }: { items: (Item & { modeLabel: string })[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="label">Von dir ausgeblendet</h3>
      <div className="flex flex-wrap gap-2">
        <AnimatePresence>
          {items.map((i) => (
            <motion.button
              key={`${i.kind}|${i.modeKey}|${i.name}`}
              layout
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={async () => {
                await postJson("/api/profile", { action: "uncorrect", kind: i.kind, modeKey: i.modeKey, name: i.name });
                start(() => router.refresh());
              }}
              className="chip line-through decoration-bad/60 hover:no-underline hover:text-text"
              title="Wiederherstellen"
            >
              {i.kind === "driver" ? "Treiber" : "Abneigung"}: {i.name} · {i.modeLabel} · wiederherstellen
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
