"use client";

import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { postJson } from "@/lib/client";
import { JobControl } from "./jobs";

type Settings = { enabled: boolean; bundles: boolean; deals: boolean; bundleRatio: number };
const RATIOS = [2, 2.5, 3, 4];

/** E-Mail-Benachrichtigungen: Adresse bestätigen, dann Bundles/Deals an- oder abwählen. */
export function NotifySettings({
  mailReady,
  email,
  verified,
  initial,
}: {
  mailReady: boolean;
  email: string | null;
  verified: boolean;
  initial: Settings;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [s, setS] = useState(initial);
  const [address, setAddress] = useState(email ?? "");
  const [editing, setEditing] = useState(!email);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!mailReady) {
    return (
      <p className="text-sm text-muted">
        E-Mail-Versand ist noch nicht eingerichtet: <code className="font-mono text-text">SMTP_USER</code> und{" "}
        <code className="font-mono text-text">SMTP_PASS</code> (z. B. Gmail mit App-Passwort) in <code className="font-mono text-text">.env.local</code> und Vercel eintragen.
      </p>
    );
  }

  async function sendLink() {
    setBusy(true);
    setMsg(null);
    try {
      await postJson("/api/notify", { action: "email", email: address });
      setEditing(false);
      setMsg(`Bestätigungslink an ${address} geschickt – klick ihn an, dann geht's los.`);
      start(() => router.refresh());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function save(patch: Partial<Settings>) {
    const next = { ...s, ...patch };
    setS(next);
    try {
      await postJson("/api/notify", { action: "settings", ...patch });
    } catch (e) {
      setS(s);
      setMsg(e instanceof Error ? e.message : "Fehler");
    }
  }

  if (editing || !email) {
    return (
      <div className="space-y-2">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void sendLink();
          }}
        >
          <input className="input" type="email" required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="deine@adresse.de" autoComplete="email" />
          <button className="btn-primary shrink-0" disabled={busy}>
            {busy ? "Sende …" : "Bestätigungslink senden"}
          </button>
        </form>
        <p className="text-xs text-muted">Die Adresse wird erst nach dem Klick auf den Link genutzt und nur für diese Benachrichtigungen.</p>
        {msg && <p className="text-sm text-muted">{msg}</p>}
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-muted">
          {msg ?? (
            <>
              Warte auf Bestätigung von <span className="text-text">{email}</span> – schau in dein Postfach (auch im Spam-Ordner).
            </>
          )}
        </p>
        <div className="flex gap-4">
          <button className="text-muted underline hover:text-text" disabled={busy} onClick={sendLink}>
            Link erneut senden
          </button>
          <button className="text-muted underline hover:text-text" onClick={() => setEditing(true)}>
            Andere Adresse
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => save({ enabled: !s.enabled })}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 transition ${s.enabled ? "border-text/50 bg-white/[0.07] text-text" : "border-line text-muted hover:text-text"}`}
        >
          {s.enabled ? <Bell size={14} className="text-accent" /> : <BellOff size={14} />}
          {s.enabled ? "Benachrichtigungen an" : "Benachrichtigungen aus"}
        </button>
        <span className="text-muted">
          an {email} ·{" "}
          <button className="underline hover:text-text" onClick={() => setEditing(true)}>
            ändern
          </button>
        </span>
      </div>

      <fieldset disabled={!s.enabled} className={`space-y-3 ${s.enabled ? "" : "opacity-50"}`}>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={s.bundles} onChange={(e) => save({ bundles: e.target.checked })} />
          <span>
            <span className="text-text">Bundles</span>{" "}
            <span className="text-muted">mit Spielen von Wunschliste oder Empfehlungen, die darin mindestens</span>{" "}
            <select
              className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-text"
              value={s.bundleRatio}
              onChange={(e) => save({ bundleRatio: Number(e.target.value) })}
            >
              {RATIOS.map((r) => (
                <option key={r} value={r}>
                  {String(r).replace(".", ",")}×
                </option>
              ))}
            </select>{" "}
            <span className="text-muted">so viel wert sind wie der Bundle-Preis</span>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={s.deals} onChange={(e) => save({ deals: e.target.checked })} />
          <span>
            <span className="text-text">Deals</span>{" "}
            <span className="text-muted">
              für Wunschliste und Empfehlungen am Allzeittief oder ab −75 % (nur Ausweich-Plattform: nur bei Top-Passung)
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <JobControl kind="deals" label="Jetzt prüfen" className="btn-ghost !px-3 !py-1.5 !text-xs" />
        <p className="text-xs text-muted">Automatisch jeden Morgen gegen 9 Uhr. Jeder Treffer kommt nur einmal, Deals erneut nur, wenn sie noch günstiger werden.</p>
      </div>
      {msg && <p className="text-sm text-bad">{msg}</p>}
    </div>
  );
}
