import { db } from "./src/lib/db.ts";
import { getTasteProfile, buildModeInput, capUnprovenAversions } from "./src/lib/taste.ts";
import { toPgVector, parsePgVector } from "./src/lib/gemini.ts";
import { loadIntents } from "./src/lib/recommend.ts";
const { data: user } = await db().from("users").select("*").eq("is_admin", true).limit(1).single();
const p = (await getTasteProfile(user.id))!.profile;
const input = await buildModeInput(user.id);
console.log("Negative eigene Worte:", input.ownWords.replace(/\s+/g, " ").slice(0, 200) || "(keine)");
const capped = capUnprovenAversions(p, `${user.about_me ?? ""} ${input.ownWords}`, []);
console.log("Global:", p.global_aversions.map((a, i) => `${a.name}: ${a.severity} -> ${capped.global_aversions[i].severity}`).join(" | "));

// Wirkung des Feedbacks auf die Rangliste der betroffenen Facetten (Top 15 Überschneidung)
const { data: fb } = await db().from("rec_feedback").select("verdict, games(title)").eq("user_id", user.id);
console.log("Feedback:", (fb as any[]).map(f => `${f.verdict === "interested" ? "👍" : "👎"} ${f.games.title}`).join(", "));
const { data: raw } = await db().from("taste_intents").select("label, mode_key, embedding").eq("user_id", user.id);
const adj = await loadIntents(user.id);
for (const r of raw as any[]) {
  const a = adj.find(x => x.label === r.label)!;
  const top = async (v: number[]) => ((await db().rpc("match_new_games", { p_user: user.id, p_query: toPgVector(v), p_count: 15 })).data as any[]).map(x => x.game_id);
  const [t0, t1] = await Promise.all([top(parsePgVector(r.embedding)!), top(a.vector)]);
  const changed = t1.filter(x => !t0.includes(x)).length;
  if (changed || t0.join() !== t1.join()) console.log(`  ${r.label}: ${changed}/15 neue Kandidaten, Reihenfolge ${t0.join() === t1.join() ? "gleich" : "geändert"}`);
}
