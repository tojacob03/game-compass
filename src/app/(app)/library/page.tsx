import Link from "next/link";
import { AddGameForm } from "@/components/AddGameForm";
import { FamilyManager } from "@/components/FamilyManager";
import { SelfImport } from "@/components/GameListImport";
import { familyGroupId, listFamilyMembers } from "@/lib/family";
import { GameCard, ScoreBadge } from "@/components/GameCard";
import { AnimatedTabs } from "@/components/ui/AnimatedTabs";
import { Reveal } from "@/components/ui/Reveal";
import { ENGAGEMENT_STYLE, engagementOf } from "@/lib/engagement";
import { db, fetchAll, must, selectInChunks } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { GAME_LIST_COLUMNS, type GameListItem } from "@/lib/types";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import { PlatformBadges } from "@/components/PlatformBadges";

/** Plattform-Filter als Supabase-Bedingung (prefix = "games." bei verschachtelter Abfrage). */
type Filterable = { eq(c: string, v: unknown): Filterable; gte(c: string, v: unknown): Filterable; not(c: string, op: string, v: unknown): Filterable };
function platformFilter<Q>(query: Q, key: PlatformKey | null, prefix = ""): Q {
  const q = query as unknown as Filterable;
  if (key === "mac") return q.eq(`${prefix}plat_mac`, true) as unknown as Q;
  if (key === "linux") return q.eq(`${prefix}plat_linux`, true) as unknown as Q;
  if (key === "deck") return q.gte(`${prefix}deck_compat`, 2) as unknown as Q;
  if (key === "gfn") return q.not(`${prefix}gfn_store`, "is", null) as unknown as Q;
  return query;
}

const TABS = [
  { id: "owned", label: "Steam" },
  { id: "wishlist", label: "Wunschliste" },
  { id: "family", label: "Steam-Familie" },
  { id: "other", label: "Andere Plattformen" },
  { id: "rated", label: "Bewertet" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const LIMIT = 120;

type Row = {
  playtime_minutes: number;
  score: number | null;
  platform: string | null;
  last_played_at?: string | null;
  status?: string | null;
  rate_skipped_at?: string | null;
  games: GameListItem & { median_playtime_minutes?: number | null; chips?: { endless: boolean } | null };
  owners?: string[];
};

export default async function Library(props: PageProps<"/library">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "owned";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const plat = PLATFORMS.some((p) => p.key === sp.p && p.key !== "windows") ? (sp.p as PlatformKey) : null;
  const href = (t: string, p: PlatformKey | null) => `/library?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}${p ? `&p=${p}` : ""}`;
  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  // Steam-Familie: Mitglieder ohne Konto + angemeldete Mitglieder (für die Verwaltung)
  const familyMembers = tab === "family" ? await listFamilyMembers(user) : [];
  let appMembers: string[] = [];
  if (tab === "family") {
    const gid = await familyGroupId(user);
    if (gid) {
      const { data } = await db().from("group_members").select("users(display_name)").eq("group_id", gid).neq("user_id", user.id);
      appMembers = ((data ?? []) as unknown as { users: { display_name: string } }[]).map((r) => r.users.display_name);
    }
  }

  let rows: Row[] = [];
  if (tab === "family") {
    const famRows = await fetchAll<{ game_id: string; owner_names: string[] }>(
      (from, to) => db().rpc("family_library", { p_user: user.id }).range(from, to),
      "family_library",
    );
    if (famRows.length) {
      const games = (
        await selectInChunks<GameListItem>(
          famRows.map((f) => f.game_id),
          (chunk) => {
            let gq = platformFilter(db().from("games").select(GAME_LIST_COLUMNS).in("id", chunk), plat);
            if (q) gq = gq.ilike("title", pattern);
            return gq as unknown as PromiseLike<{ data: GameListItem[] | null; error: { message: string } | null }>;
          },
          "family.games",
        )
      )
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, LIMIT);
      const owners = new Map(famRows.map((f) => [f.game_id, f.owner_names]));
      rows = games.map((g) => ({ playtime_minutes: 0, score: null, platform: "steam", games: g, owners: owners.get(g.id) }));
    }
  } else {
    let uq = db()
      .from("user_games")
      .select(`playtime_minutes, score, platform, last_played_at, status, rate_skipped_at, games!inner(${GAME_LIST_COLUMNS}, median_playtime_minutes, chips)`)
      .eq("user_id", user.id)
      .limit(LIMIT);
    if (tab === "owned") uq = uq.eq("owned", true).order("playtime_minutes", { ascending: false });
    if (tab === "wishlist") uq = uq.eq("wishlisted", true).order("updated_at", { ascending: false });
    if (tab === "other") uq = uq.eq("manual", true).order("updated_at", { ascending: false });
    if (tab === "rated") uq = uq.not("score", "is", null).order("score", { ascending: false });
    if (q) uq = uq.ilike("games.title", pattern);
    uq = platformFilter(uq, plat, "games.");
    rows = must(await uq, "library") as unknown as Row[];
  }

  return (
    <Reveal className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="h1">Bibliothek</h1>
        <form action="/library" className="w-full sm:w-64">
          <input type="hidden" name="tab" value={tab} />
          {plat && <input type="hidden" name="p" value={plat} />}
          <input name="q" defaultValue={q} className="input" placeholder="Suchen …" />
        </form>
      </div>
      <AnimatedTabs
        id="library"
        active={tab}
        items={TABS.map((t) => ({ key: t.id, href: href(t.id, plat), label: t.label }))}
      />
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-muted">Läuft auf</span>
        {[null, ...PLATFORMS.filter((p) => p.key !== "windows").map((p) => p.key)].map((k) => (
          <Link
            key={k ?? "alle"}
            href={href(tab, k)}
            className={`rounded-full border px-2.5 py-1 transition ${plat === k ? "border-text/50 text-text" : "border-line text-muted hover:text-text"}`}
          >
            {k ? PLATFORMS.find((p) => p.key === k)!.label : "Alles"}
          </Link>
        ))}
      </div>

      {plat === "gfn" && (
        <p className="text-xs text-muted">
          GeForce NOW laut offizieller NVIDIA-Liste. Steht „GFN · Epic“ o. ä. am Spiel, läuft es dort nur mit der Version aus diesem Shop.
        </p>
      )}
      <p className="text-sm text-muted">
        Tipp ein Spiel an, um es ausführlich zu bewerten: Note 1–10, was gepackt und was gestört hat, eigene Worte. Für viele
        Spiele auf einmal geht&apos;s schneller unter{" "}
        <Link href="/rate" className="text-text underline decoration-line-strong underline-offset-4 hover:decoration-text">
          Bewerten
        </Link>
        .
      </p>

      {tab === "other" && (
        <div className="space-y-3">
          <AddGameForm />
          <SelfImport />
        </div>
      )}
      {tab === "family" && (
        <div className="space-y-3">
          <FamilyManager members={familyMembers} appMembers={appMembers} />
          <p className="text-xs text-muted">
            Unten: Spiele der anderen, die du nicht selbst besitzt. Nicht jedes Spiel ist auf Steam für Family Sharing freigegeben.
            Wer GameCompass selbst nutzt, kann per Einladungscode unter{" "}
            <Link href="/groups" className="underline hover:text-text">
              Gruppen
            </Link>{" "}
            beitreten – dann kommen die Spiele automatisch.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-muted">Hier ist noch nichts.</p>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {rows.map((r) => (
            <GameCard
              key={r.games.id}
              game={r.games}
              href={r.score == null && r.playtime_minutes >= 60 ? `/games/${r.games.id}#bewerten` : undefined}
              badge={
                r.score != null ? (
                  <ScoreBadge score={r.score} />
                ) : r.playtime_minutes >= 60 || (r.platform && r.platform !== "steam") ? (
                  <span className="rounded-lg border border-white/20 bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur">Bewerten</span>
                ) : undefined
              }
              meta={
                <>
                  {r.owners ? `von ${r.owners.join(", ")}` : <LibraryMeta row={r} />}
                  {plat && <PlatformBadges game={r.games} mine={[plat]} className="mt-1" />}
                </>
              }
            />
          ))}
        </div>
      )}
      {rows.length >= LIMIT && <p className="text-xs text-muted">Zeige die ersten {LIMIT} – nutze die Suche für mehr.</p>}
    </Reveal>
  );
}

function LibraryMeta({ row: r }: { row: Row }) {
  const e = engagementOf({
    playtime_minutes: r.playtime_minutes,
    last_played_at: r.last_played_at ?? null,
    score: r.score,
    status: r.status ?? null,
    rate_skipped_at: r.rate_skipped_at ?? null,
    typical_minutes: r.games.median_playtime_minutes ?? null,
    endless: r.games.chips?.endless,
  });
  const parts = [
    r.playtime_minutes ? <span key="h">{Math.round(r.playtime_minutes / 60)} h</span> : null,
    e ? (
      <span key="e" className={ENGAGEMENT_STYLE[e.label]}>
        {e.label}
      </span>
    ) : null,
    r.platform && r.platform !== "steam" ? <span key="p">{r.platform}</span> : null,
    !r.games.analyzed_at ? <span key="a">nicht analysiert</span> : null,
  ].filter(Boolean);
  if (!parts.length) return <span>&nbsp;</span>;
  return (
    <span className="flex flex-wrap gap-x-1.5">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && "· "}
          {p}
        </span>
      ))}
    </span>
  );
}
