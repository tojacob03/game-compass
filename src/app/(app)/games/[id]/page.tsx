import { notFound } from "next/navigation";
import { z } from "zod";
import { ScoreBadge } from "@/components/GameCard";
import { RatingForm } from "@/components/RatingForm";
import { db } from "@/lib/db";
import { wilson } from "@/lib/recommend";
import { requireUser } from "@/lib/session";
import { steamStoreUrl } from "@/lib/steam";
import type { GameRow, UserGameRow } from "@/lib/types";

export default async function GamePage(props: PageProps<"/games/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { data: g } = await db()
    .from("games")
    .select(
      "id, steam_appid, title, header_image, short_description, genres, tags, developers, release_year, review_positive, review_negative, essence, analyzed_at, analysis_error, chips, median_playtime_minutes",
    )
    .eq("id", id)
    .maybeSingle();
  if (!g) notFound();
  const game = g as GameRow;

  const [{ data: rel }, { data: fr }, { data: queued }] = await Promise.all([
    db().from("user_games").select("*").eq("user_id", user.id).eq("game_id", id).maybeSingle(),
    db().rpc("group_ratings", { p_user: user.id }),
    db().from("analysis_queue").select("game_id").eq("game_id", id).eq("requested_by", user.id).maybeSingle(),
  ]);
  const ug = rel as UserGameRow | null;
  const friends = ((fr ?? []) as { game_id: string; rater_name: string; score: number; loved: string | null; disliked: string | null }[]).filter(
    (f) => f.game_id === id,
  );
  const e = game.essence;
  const total = (game.review_positive ?? 0) + (game.review_negative ?? 0);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {game.header_image && <img src={game.header_image} alt="" className="w-full rounded-xl border border-line" />}
        <div className="space-y-2">
          <h1 className="h1">{game.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {game.release_year && <span>{game.release_year}</span>}
            {game.developers.length > 0 && <span>· {game.developers.join(", ")}</span>}
            {total > 0 && (
              <span>
                · Steam {Math.round(((game.review_positive ?? 0) / total) * 100)}% positiv ({total.toLocaleString("de-DE")})
                {(wilson(game.review_positive, game.review_negative) ?? 0) > 0.9 && " ★"}
              </span>
            )}
            {game.steam_appid && (
              <a href={steamStoreUrl(game.steam_appid)} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                Steam-Seite
              </a>
            )}
          </div>
          {game.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {game.tags.slice(0, 12).map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {e ? (
          <section className="card space-y-5 p-5">
            <div>
              <h2 className="h2">Essenz</h2>
              <p className="mt-1 text-muted">{e.summary}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {e.abstract_qualities.map((q) => (
                <div key={q.name} className="rounded-lg border border-line bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{q.name}</span>
                    <span className="text-xs text-accent">{"●".repeat(q.strength)}{"○".repeat(5 - q.strength)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{q.description}</p>
                </div>
              ))}
            </div>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {(
                [
                  ["Ablauf", e.core_loop],
                  ["Fantasie", e.player_fantasy],
                  ["Fortschritt", e.progression],
                  ["Welt", e.world],
                  ["Erzählung", e.narrative],
                  ["Stimmung", e.tone_mood.join(", ")],
                  ["Ästhetik", e.aesthetics],
                  ["Tempo", e.pacing_session],
                  ["Herausforderung", e.challenge_friction],
                  ["Sozial", e.social],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="label">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="label !text-good">Spieler lieben</h3>
                <ul className="ml-4 list-disc space-y-1 text-sm">{e.player_love.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
              <div>
                <h3 className="label !text-bad">Kritik</h3>
                <ul className="ml-4 list-disc space-y-1 text-sm">{e.player_complaints.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {e.polarizing.length > 0 && <p><span className="text-muted">Polarisiert:</span> {e.polarizing.join("; ")}</p>}
              <p><span className="text-muted">Nicht für:</span> {e.not_for}</p>
              {e.feels_like.length > 0 && <p><span className="text-muted">Fühlt sich an wie:</span> {e.feels_like.join(", ")}</p>}
              {e.content_flags.length > 0 && <p><span className="text-muted">Hinweise:</span> {e.content_flags.join(", ")}</p>}
              {e.confidence === "low" && <p className="text-xs text-bad">Die KI war sich bei dieser Analyse unsicher.</p>}
            </div>
          </section>
        ) : (
          <section className="card p-5 text-sm text-muted">
            {game.analysis_error
              ? `Analyse fehlgeschlagen: ${game.analysis_error}`
              : queued
                ? "Steht in deiner Analyse-Warteschlange – starte die KI-Analyse auf der Übersicht."
                : "Noch nicht analysiert. Bewerte das Spiel, dann wird es eingereiht."}
            {game.short_description && <p className="mt-3 text-text">{game.short_description}</p>}
          </section>
        )}
      </div>

      <aside className="space-y-6">
        <section className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="h2">Deine Meinung</h2>
            {ug?.playtime_minutes ? (
              <span className="text-sm text-muted">
                {Math.round(ug.playtime_minutes / 60)} h gespielt
                {game.median_playtime_minutes ? ` · typisch ~${Math.round(game.median_playtime_minutes / 60)} h` : ""}
              </span>
            ) : null}
          </div>
          <RatingForm
            gameId={game.id}
            initial={{
              score: ug?.score ?? null,
              loved: ug?.loved ?? null,
              disliked: ug?.disliked ?? null,
              status: ug?.status ?? null,
              liked: ug?.liked_aspects ?? [],
              dislikedAspects: ug?.disliked_aspects ?? [],
            }}
            aspects={game.chips}
          />
        </section>
        {friends.length > 0 && (
          <section className="card space-y-3 p-5">
            <h2 className="h2">Deine Leute</h2>
            {friends.map((f) => (
              <div key={f.rater_name} className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{f.rater_name}</span>
                  <ScoreBadge score={f.score} />
                </div>
                {f.loved && <p className="text-muted">👍 {f.loved}</p>}
                {f.disliked && <p className="text-muted">👎 {f.disliked}</p>}
              </div>
            ))}
          </section>
        )}
      </aside>
    </div>
  );
}
