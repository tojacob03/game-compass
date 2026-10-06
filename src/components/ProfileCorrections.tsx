"use client";

import { Plus, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { postJson } from "@/lib/client";

type Item = { kind: "driver" | "aversion"; modeKey: string | null; name: string };

/**
 * Feintuning eines Profil-Eintrags: Punkte antippen = Gewicht (Treiber) bzw. Schwere (Abneigung) festlegen,
 * ↺ = zurück zum KI-Wert, ✕ = ausblenden (bzw. eigenen Eintrag löschen). Wirkt sofort, ohne Neuberechnung.
 */
export function FacetControls({ item, value, tuned, own }: { item: Item; value: number; tuned: boolean; own: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState(value);
  const [hover, setHover] = useState<number | null>(null);
  const [isTuned, setTuned] = useState(tuned);
  const aversion = item.kind === "aversion";
  const shown = hover ?? current;

  async function setWeight(n: number) {
    setCurrent(n);
    setTuned(true);
    await postJson("/api/profile", { action: "weight", ...item, weight: n });
    start(() => router.refresh());
  }
  async function reset() {
    await postJson("/api/profile", { action: "uncorrect", ...item });
    start(() => router.refresh());
  }
  async function remove() {
    await postJson("/api/profile", own ? { action: "uncorrect", ...item } : { action: "correct", ...item, verdict: "reject" });
    start(() => router.refresh());
  }

  const label = (n: number) => (aversion ? (n >= 5 ? "No-Go" : `Stört: ${n}/5`) : `Wichtig: ${n}/5`);

  return (
    <span className={`inline-flex shrink-0 items-center gap-2 ${pending ? "opacity-60" : ""}`}>
      <span className="inline-flex items-center" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label={aversion ? "Wie sehr stört dich das?" : "Wie wichtig ist dir das?"}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={current === n}
            aria-label={label(n)}
            title={label(n)}
            disabled={pending}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => setWeight(n)}
            className="grid h-6 w-[18px] place-items-center"
          >
            <span
              className={`block h-2 w-2 rounded-full transition ${
                n <= shown ? (aversion ? "bg-bad" : "bg-accent") : "bg-white/15"
              } ${hover != null && n <= hover ? "scale-125" : ""}`}
            />
          </button>
        ))}
      </span>
      <span className={`w-12 font-mono text-[10px] uppercase tracking-wider ${aversion && shown >= 5 ? "text-bad" : "text-muted"}`}>
        {own ? "eigen" : aversion && shown >= 5 ? "No-Go" : isTuned ? "fix" : "KI"}
      </span>
      {isTuned && !own ? (
        <IconButton title="Zurück zum KI-Wert" onClick={reset} disabled={pending}>
          <RotateCcw size={12} strokeWidth={2} />
        </IconButton>
      ) : (
        <span className="w-6" />
      )}
      <IconButton title={own ? "Eigenen Eintrag löschen" : "Stimmt nicht – ausblenden"} onClick={remove} disabled={pending} danger>
        <X size={13} strokeWidth={2} />
      </IconButton>
    </span>
  );
}

function IconButton({ children, danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      type="button"
      aria-label={props.title}
      {...(props as object)}
      className={`grid h-6 w-6 place-items-center rounded-full border border-line text-muted transition ${danger ? "hover:border-bad/60 hover:text-bad" : "hover:border-line-strong hover:text-text"}`}
    >
      {children}
    </motion.button>
  );
}

/** Eigenen Treiber / eigene Abneigung ergänzen – ein Feld, Enter, fertig. */
export function AddFacet({ kind, modeKey, placeholder }: { kind: Item["kind"]; modeKey: string | null; placeholder: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  async function save() {
    const value = name.trim();
    if (!value) return setOpen(false);
    setBusy(true);
    try {
      // "Name: Beschreibung" erlaubt, sonst nur der Name
      const [head, ...rest] = value.split(":");
      await postJson("/api/profile", {
        action: "add",
        kind,
        modeKey,
        name: (rest.length ? head : value).trim().slice(0, 120),
        description: rest.join(":").trim() || undefined,
      });
      setName("");
      setOpen(false);
      start(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-text">
        <Plus size={14} strokeWidth={2} /> {kind === "driver" ? "Eigenen Treiber ergänzen" : modeKey ? "Eigene Abneigung ergänzen" : "No-Go ergänzen"}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex gap-2"
    >
      <input
        className="input !py-1.5 text-sm"
        autoFocus
        value={name}
        maxLength={300}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder={placeholder}
      />
      <button className="btn-ghost shrink-0 !px-3 !py-1.5 !text-xs" disabled={busy}>
        {busy ? "…" : "Hinzufügen"}
      </button>
    </form>
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
