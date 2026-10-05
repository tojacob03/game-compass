import { z } from "zod";

/**
 * "Essenz" eines Spiels: beschreibt das ERLEBNIS, nicht das Genre oder Setting.
 * Genau diese Trennung erlaubt Empfehlungen über Genre-Grenzen hinweg
 * (z. B. Outer Wilds ↔ Return of the Obra Dinn ↔ Tunic: "Fortschritt durch Wissen").
 */
export const EssenceSchema = z.object({
  summary: z.string().describe("2-3 Sätze: Was ist das Spiel im Kern als Erlebnis? Kein Marketing."),
  core_loop: z.string().describe("Was tut man Minute für Minute tatsächlich?"),
  player_fantasy: z.string().describe("Welche Rolle/welches Gefühl verkörpert man?"),
  progression: z.string().describe("Wie kommt man voran: Wissen, Skill, Stats, Unlocks, Story, Bauen ...?"),
  world: z.string().describe("Art des Worldbuildings und WIE es vermittelt wird (Environmental Storytelling, Lore-Texte, Dialoge ...)."),
  narrative: z.string().describe("Erzählstruktur und -gewicht, oder 'kaum Story'."),
  tone_mood: z.array(z.string()).describe("3-6 Stimmungs-Begriffe"),
  aesthetics: z.string().describe("Visueller und akustischer Charakter"),
  pacing_session: z.string().describe("Tempo und typische Session-Form (kurze Runs, lange Abende, ...)"),
  challenge_friction: z.string().describe("Art der Herausforderung bzw. bewusst eingebaute Reibung"),
  social: z.string().describe("Solo, Koop, kompetitiv, asynchron ..."),
  abstract_qualities: z
    .array(
      z.object({
        name: z.string().describe("Kurzer, genre-unabhängiger Begriff, z. B. 'Neugier als Motor'"),
        description: z.string().describe("Ein Satz, wie sich das im Spiel äußert"),
        strength: z.number().int().min(1).max(5),
      }),
    )
    .describe("5-10 abstrakte, genre-übergreifende Qualitäten, die das Spiel ausmachen"),
  player_love: z.array(z.string()).describe("Was Spieler laut Reviews am meisten lieben (konkret)"),
  player_complaints: z.array(z.string()).describe("Wiederkehrende Kritikpunkte laut Reviews"),
  polarizing: z.array(z.string()).describe("Elemente, an denen sich die Geister scheiden"),
  not_for: z.string().describe("Wer wird es vermutlich NICHT mögen?"),
  feels_like: z.array(z.string()).describe("Andere Spiele mit ähnlichem GEFÜHL (gerne genreübergreifend)"),
  content_flags: z
    .array(z.string())
    .describe("Sachliche Hinweise: z. B. 'Early Access', 'starker Grind', 'Mikrotransaktionen', 'Horror', 'nur online'"),
  confidence: z.enum(["low", "medium", "high"]).describe("Wie sicher bist du dir bei dieser Analyse?"),
});
export type Essence = z.infer<typeof EssenceSchema>;

const DriverSchema = z.object({
  name: z.string(),
  description: z.string(),
  weight: z.number().int().min(1).max(5),
  evidence: z.array(z.string()).describe("Spieletitel oder Zitate, die das belegen"),
});
const AversionSchema = z.object({
  name: z.string(),
  description: z.string(),
  severity: z.number().int().min(1).max(5).describe("5 = absolutes No-Go"),
  evidence: z.array(z.string()),
});

/**
 * Geschmacksprofil v2: mehrere SPIELMODI statt eines Durchschnitts.
 * Die Modi kommen aus einem Clustering der Spiel-Essenzen (gewichtet nach Engagement);
 * die KI benennt und beschreibt sie nur.
 */
export const TasteProfileSchema = z.object({
  summary: z.string().describe("2-3 Sätze in der Du-Form: Was verbindet die Modi, was unterscheidet sie?"),
  modes: z
    .array(
      z.object({
        cluster: z.number().int().describe("Nummer der Spielgruppe aus dem Prompt"),
        name: z.string().describe("Kurzer, griffiger Name des Modus (2-4 Wörter), z. B. 'Taktische Story-Abende'"),
        emoji: z.string().describe("Ein passendes Emoji"),
        tagline: z.string().describe("Ein Satz in der Du-Form: Was suchst du in diesem Modus?"),
        when: z.string().describe("Wann/wie wird so gespielt? (allein abends, mit Freunden, nebenbei ...) – nur wenn erkennbar, sonst leer"),
        drivers: z.array(DriverSchema).describe("Was in DIESEM Modus begeistert"),
        aversions: z.array(AversionSchema).describe("Was in DIESEM Modus stört (darf in anderen Modi okay sein)"),
        search_intents: z
          .array(
            z.object({
              label: z.string(),
              description: z
                .string()
                .describe(
                  "4-6 Sätze, die ein ideales NEUES Spiel für diesen Modus als ERLEBNIS beschreiben (Core Loop, Fortschritt, Welt, Stimmung, Qualitäten). KEINE Titel, KEIN Genre-Name.",
                ),
              weight: z.number().int().min(1).max(5),
            }),
          )
          .describe("1-2 Such-Facetten für diesen Modus"),
        steam_tags: z.array(z.string()).describe("3-5 offizielle englische Steam-Tags für diesen Modus"),
      }),
    )
    .describe("Ein Eintrag pro Spielgruppe aus dem Prompt (Gruppen, die nur Rauschen sind, weglassen)"),
  global_aversions: z.array(AversionSchema).describe("Was in JEDEM Modus stört (echte No-Gos)"),
  open_questions: z.array(z.string()).describe("Was ist noch unklar? Max. 3 kurze Fragen"),
  exploration_edges: z.array(z.string()).describe("Richtungen, die die Person noch nicht kennt, aber mögen könnte"),
});
export type TasteProfile = z.infer<typeof TasteProfileSchema>;
export type TasteMode = TasteProfile["modes"][number] & { key: string; anchors: string[] };
/** Gespeichertes Profil: Modi mit stabilem Schlüssel + Anker-Spielen aus dem Clustering. */
export type StoredTasteProfile = Omit<TasteProfile, "modes"> & { modes: TasteMode[]; version: 2 };

export const GameFactsSchema = z.object({
  games: z.array(
    z.object({
      n: z.number().int().describe("Nummer des Spiels aus der Liste"),
      typical_hours: z
        .number()
        .describe(
          "Wie viele Stunden spielt jemand, der das Spiel wirklich durchspielt/ausgiebig erlebt (ähnlich HowLongToBeat 'Main + Extras'). Bei endlosen Spielen (MMO, Live-Service, Sandbox, Idle): Stunden, ab denen man von 'richtig gespielt' sprechen kann.",
        ),
      endless: z.boolean().describe("Endlos-Spiel ohne echtes Ende (MMO, Live-Service, Sandbox, Idle, Multiplayer)?"),
      loved: z.array(z.string()).describe("4 kurze Aspekte (max. 4 Wörter), die Fans an GENAU diesem Spiel lieben"),
      criticized: z.array(z.string()).describe("3 kurze Aspekte (max. 4 Wörter), die typischerweise stören"),
    }),
  ),
});

export const LateralProposalsSchema = z.object({
  proposals: z.array(
    z.object({
      title: z.string().describe("Exakter Steam-Titel"),
      mode: z.string().describe("Name des Spielmodus, den das trifft"),
      hypothesis: z.string().describe("Warum es passen könnte – über das Genre hinaus"),
      hidden_gem: z.boolean(),
    }),
  ),
});

export const RerankSchema = z.object({
  picks: z.array(
    z.object({
      candidate: z.number().int().describe("Nummer des Kandidaten aus der Liste"),
      fit: z.number().int().min(0).max(100),
      headline: z.string().describe("Ein knackiger Satz (Deutsch), warum genau DIESE Person das spielen sollte"),
      why: z.string().describe("2-3 Sätze, mit Bezug auf konkrete Spiele/Aussagen der Person"),
      risks: z.string().describe("Was die Person stören könnte (aus Aversionen × Kritikpunkten). Leer, wenn nichts."),
      matched_drivers: z.array(z.string()),
      is_wildcard: z.boolean(),
      mode: z.string().describe("Name des Spielmodus, zu dem die Empfehlung gehört"),
    }),
  ),
});
