import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, must } from "./db";
import { findDeals, type BundleItem, type DealItem } from "./deals";
import { env } from "./env";
import { mailConfigured, sendMail } from "./mail";
import { fallbackLabel, prefsOf, supports, type PlatformPrefs } from "./platforms";
import { HttpError } from "./session";
import type { UserRow } from "./types";

/**
 * E-Mail-Benachrichtigungen für Deals und Bundles.
 * - Adresse nur nach Bestätigung per signiertem Link (niemand kann fremde Adressen eintragen)
 * - eine Sammel-Mail pro Lauf, nur echte Treffer, jeder Treffer nur einmal (Deals erneut nur, wenn noch günstiger)
 * - Abmelde-Link in jeder Mail
 */
export type NotifySettings = { enabled: boolean; bundles: boolean; deals: boolean; bundleRatio: number };
export const BUNDLE_RATIOS = [2, 2.5, 3, 4] as const;

export function settingsOf(user: Pick<UserRow, "notify">): NotifySettings {
  const n = (user.notify ?? {}) as Partial<NotifySettings>;
  return {
    enabled: n.enabled ?? false,
    bundles: n.bundles ?? true,
    deals: n.deals ?? true,
    bundleRatio: BUNDLE_RATIOS.includes(n.bundleRatio as (typeof BUNDLE_RATIOS)[number]) ? n.bundleRatio! : 2.5,
  };
}

// ---------------------------------------------------------------------------
// Signierte Links (Bestätigen, Abmelden)
// ---------------------------------------------------------------------------

const base = () => env().APP_URL.replace(/\/$/, "");
const sign = (...parts: string[]) => createHmac("sha256", env().SESSION_SECRET).update(`notify:${parts.join("|")}`).digest("hex").slice(0, 40);
function valid(sig: string | null, ...parts: string[]) {
  if (!sig) return false;
  const a = Buffer.from(sign(...parts));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyUrl(userId: string, email: string) {
  const exp = String(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return `${base()}/api/notify/verify?${new URLSearchParams({ u: userId, e: email, x: exp, s: sign("verify", userId, email, exp) })}`;
}
export const unsubscribeUrl = (userId: string) => `${base()}/api/notify/unsubscribe?${new URLSearchParams({ u: userId, s: sign("unsub", userId) })}`;

export async function confirmEmail(p: URLSearchParams): Promise<boolean> {
  const [u, e, x, s] = ["u", "e", "x", "s"].map((k) => p.get(k) ?? "");
  if (!valid(s, "verify", u, e, x) || Number(x) < Date.now()) return false;
  const { data } = await db().from("users").select("email, notify").eq("id", u).maybeSingle();
  const row = data as Pick<UserRow, "email" | "notify"> | null;
  if (!row || row.email?.toLowerCase() !== e.toLowerCase()) return false; // inzwischen andere Adresse eingetragen
  must(
    await db().from("users").update({ email_verified_at: new Date().toISOString(), notify: { ...settingsOf(row), enabled: true } }).eq("id", u),
    "users.verify",
  );
  return true;
}

export async function unsubscribe(p: URLSearchParams): Promise<boolean> {
  const u = p.get("u") ?? "";
  if (!valid(p.get("s"), "unsub", u)) return false;
  const { data } = await db().from("users").select("notify").eq("id", u).maybeSingle();
  if (!data) return false;
  await db().from("users").update({ notify: { ...settingsOf(data as Pick<UserRow, "notify">), enabled: false } }).eq("id", u);
  return true;
}

// ---------------------------------------------------------------------------
// Adresse setzen + Bestätigungs-Mail
// ---------------------------------------------------------------------------

export async function requestVerification(user: UserRow, email: string) {
  if (!mailConfigured()) throw new HttpError(400, "E-Mail-Versand ist noch nicht eingerichtet.");
  const { data: last } = await db().from("notification_log").select("sent_at").eq("user_id", user.id).eq("kind", "verify").eq("ref", "last").maybeSingle();
  if (last && Date.now() - Date.parse((last as { sent_at: string }).sent_at) < 2 * 60 * 1000) {
    throw new HttpError(429, "Bitte warte zwei Minuten, bevor du noch einen Bestätigungslink anforderst.");
  }
  must(await db().from("users").update({ email, email_verified_at: null }).eq("id", user.id), "users.email");
  const link = verifyUrl(user.id, email);
  await sendMail({
    to: email,
    subject: "GameCompass: E-Mail-Adresse bestätigen",
    text: `Hallo ${user.display_name},\n\nbestätige deine Adresse für Deal- und Bundle-Benachrichtigungen:\n${link}\n\nWenn du das nicht angefordert hast, ignoriere diese Mail einfach.`,
    html: layout(
      `<p>Hallo ${esc(user.display_name)},</p>
       <p>bestätige deine Adresse, dann meldet GameCompass dir besonders gute Bundles und Deals für deine Wunschliste und Empfehlungen.</p>
       <p><a href="${link}" style="${BUTTON}">Adresse bestätigen</a></p>
       <p style="color:#77706a;font-size:13px">Der Link ist drei Tage gültig. Wenn du das nicht angefordert hast, ignoriere diese Mail einfach.</p>`,
    ),
  });
  await db().from("notification_log").upsert({ user_id: user.id, kind: "verify", ref: "last", sent_at: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Treffer auswählen + Sammel-Mail
// ---------------------------------------------------------------------------

type Logged = Map<string, number | null>;

function bundleAlerts(bundles: BundleItem[], s: NotifySettings, logged: Logged) {
  if (!s.bundles) return [];
  return bundles
    .filter((b) => b.matched.some((m) => m.wanted) && b.wantedValue >= s.bundleRatio * b.price.amount && !logged.has(`bundle|${b.id}`))
    .slice(0, 5);
}

function dealAlerts(deals: DealItem[], s: NotifySettings, logged: Logged) {
  if (!s.deals) return [];
  return deals
    .filter((d) => {
      if (!d.wishlisted && !d.recommended) return false;
      if (d.reach === "fallback" && (d.fit ?? 0) < 90) return false; // Ausweich-Plattform nur bei Top-Passung
      // Allzeittief (mit spürbarem Rabatt) oder mindestens −75 %
      if (!(d.atLow && d.best.cut >= 25) && d.best.cut < 75) return false;
      if ((d.fit ?? 60) < 70) return false;
      const before = logged.get(`deal|${d.game.id}`);
      return before === undefined || (before !== null && d.best.price.amount < before - 0.5);
    })
    .slice(0, 8);
}

/** Prüft die Angebote für eine Person und verschickt bei Treffern eine Sammel-Mail. Gibt die Anzahl Treffer zurück. */
export async function notifyUser(user: UserRow, opts: { dryRun?: boolean } = {}): Promise<{ bundles: BundleItem[]; deals: DealItem[] }> {
  const s = settingsOf(user);
  const result = await findDeals(user, { fresh: true });
  const { data: logRows } = await db().from("notification_log").select("kind, ref, price").eq("user_id", user.id).in("kind", ["bundle", "deal"]);
  const logged: Logged = new Map(((logRows ?? []) as { kind: string; ref: string; price: number | null }[]).map((r) => [`${r.kind}|${r.ref}`, r.price]));
  const bundles = bundleAlerts(result.bundles, s, logged);
  const deals = dealAlerts(result.deals, s, logged);
  if (opts.dryRun || (!bundles.length && !deals.length)) return { bundles, deals };
  if (!s.enabled || !user.email || !user.email_verified_at || !mailConfigured()) return { bundles: [], deals: [] };

  const prefs = prefsOf(user);
  const money = (n: number, c = "EUR") => new Intl.NumberFormat("de-DE", { style: "currency", currency: c }).format(n);
  const until = (iso: string | null) => (iso ? ` · bis ${new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" })}` : "");

  const bundleHtml = bundles
    .map(
      (b) => `<tr><td style="padding:14px 0;border-top:1px solid #e8e3da">
        <div style="font-size:12px;color:#77706a;text-transform:uppercase;letter-spacing:.06em">${esc(b.shop)}${esc(until(b.expiry))}</div>
        <div style="font-size:17px;font-weight:600;margin:2px 0 4px"><a href="${b.url}" style="color:#1a1714;text-decoration:none">${esc(b.title)}</a></div>
        <div><b>${money(b.price.amount, b.price.currency)}</b> <span style="color:#77706a">statt ${money(b.wantedValue, b.price.currency)} für deine gewünschten Spiele</span></div>
        <div style="margin-top:6px;font-size:14px;color:#3d3833">${b.matched.map((m) => (m.wanted ? `<b>${esc(m.title)}</b>` : esc(m.title))).join(" · ")}</div>
      </td></tr>`,
    )
    .join("");
  const dealHtml = deals
    .map(
      (d) => `<tr><td style="padding:12px 0;border-top:1px solid #e8e3da">
        <div style="font-size:16px;font-weight:600"><a href="${d.best.url}" style="color:#1a1714;text-decoration:none">${esc(d.game.title)}</a></div>
        <div><b>${money(d.best.price.amount, d.best.price.currency)}</b> <span style="color:#ff6a3d;font-weight:600">−${d.best.cut} %</span>
          <span style="color:#77706a">bei ${esc(d.best.shop)}${d.atLow ? " · Allzeittief" : ""}${esc(until(d.best.expiry))}</span></div>
        <div style="font-size:13px;color:#77706a">${d.wishlisted ? "Wunschliste" : "Empfehlung"}${d.fit != null ? ` · Passung ${d.fit}` : ""}${
          d.reach === "fallback" ? ` · nur ${esc(fallbackLabel(d.game, prefs))}` : ""
        }${gfnStoreWarning(d, prefs) ? ` · <span style="color:#c2410c">${esc(gfnStoreWarning(d, prefs)!)}</span>` : ""}</div>
      </td></tr>`,
    )
    .join("");

  const parts = [bundles.length && `${bundles.length} Bundle${bundles.length > 1 ? "s" : ""}`, deals.length && `${deals.length} Deal${deals.length > 1 ? "s" : ""}`].filter(Boolean);
  const unsub = unsubscribeUrl(user.id);
  await sendMail({
    to: user.email,
    subject: `GameCompass: ${parts.join(" und ")} für dich`,
    unsubscribeUrl: unsub,
    text: [
      ...bundles.map((b) => `Bundle: ${b.title} (${b.shop}) – ${money(b.price.amount, b.price.currency)} statt ${money(b.wantedValue)}: ${b.matched.map((m) => m.title).join(", ")}\n${b.url}`),
      ...deals.map((d) => `Deal: ${d.game.title} – ${money(d.best.price.amount)} (−${d.best.cut} %) bei ${d.best.shop}${d.atLow ? ", Allzeittief" : ""}\n${d.best.url}`),
      `\nAlle Angebote: ${base()}/deals\nAbmelden: ${unsub}`,
    ].join("\n\n"),
    html: layout(
      `${bundles.length ? `<h2 style="font-size:15px;margin:24px 0 4px">Bundles mit Spielen, die du willst</h2><table width="100%" cellspacing="0" cellpadding="0">${bundleHtml}</table>` : ""}
       ${deals.length ? `<h2 style="font-size:15px;margin:24px 0 4px">Starke Deals aus Wunschliste und Empfehlungen</h2><table width="100%" cellspacing="0" cellpadding="0">${dealHtml}</table>` : ""}
       <p style="margin-top:24px"><a href="${base()}/deals" style="${BUTTON}">Alle passenden Angebote</a></p>
       <p style="color:#77706a;font-size:12px;margin-top:28px">Preise von IsThereAnyDeal. Du bekommst jeden Treffer nur einmal (Deals erneut nur, wenn sie noch günstiger werden).
       <a href="${unsub}" style="color:#77706a">Benachrichtigungen abbestellen</a></p>`,
    ),
  });

  const now = new Date().toISOString();
  await db()
    .from("notification_log")
    .upsert([
      ...bundles.map((b) => ({ user_id: user.id, kind: "bundle", ref: String(b.id), price: b.price.amount, sent_at: now })),
      ...deals.map((d) => ({ user_id: user.id, kind: "deal", ref: d.game.id, price: d.best.price.amount, sent_at: now })),
    ]);
  return { bundles, deals };
}

/** Wenn GeForce NOW der einzige Weg ist und dort nur eine andere Shop-Version läuft (z. B. Epic). */
function gfnStoreWarning(d: DealItem, prefs: PlatformPrefs): string | null {
  const store = d.game.gfn_store;
  if (!store || store === "Steam" || !prefs.primary.includes("gfn")) return null;
  if (prefs.primary.some((k) => k !== "gfn" && supports(d.game, k))) return null;
  return `für GeForce NOW die ${store === "?" ? "Version aus einem anderen Shop" : `${store}-Version`} kaufen`;
}

// ---------------------------------------------------------------------------
// Mail-Layout (hell, schlicht – Mail-Clients mögen keine dunklen Hintergründe)
// ---------------------------------------------------------------------------

const BUTTON = "display:inline-block;background:#1a1714;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600";

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(body: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1a1714">
  <table width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 16px">
    <table width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;padding:28px">
      <tr><td>
        <div style="font-family:Georgia,serif;font-size:20px;margin-bottom:18px">Game<i>Compass</i> <span style="color:#ff6a3d">●</span></div>
        ${body}
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}
