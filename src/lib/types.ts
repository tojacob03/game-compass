export type UserRow = {
  id: string;
  steam_id: string;
  display_name: string;
  avatar_url: string | null;
  status: "pending" | "active" | "blocked";
  is_admin: boolean;
  about_me: string | null;
  last_synced_at: string | null;
  created_at: string;
};

export type GameRow = {
  id: string;
  steam_appid: number | null;
  title: string;
  header_image: string | null;
  short_description: string | null;
  about: string | null;
  genres: string[];
  tags: string[];
  developers: string[];
  release_year: number | null;
  review_positive: number | null;
  review_negative: number | null;
  metadata_fetched_at: string | null;
  essence: import("./schemas").Essence | null;
  essence_text: string | null;
  essence_model: string | null;
  analyzed_at: string | null;
  analysis_error: string | null;
  analysis_attempts: number;
  created_by: string | null;
  median_playtime_minutes: number | null; // typische Spielzeit (KI-Schätzung)
  chips: GameChips | null;
};

export type GameChips = { loved: string[]; criticized: string[]; endless: boolean };

export type UserGameRow = {
  user_id: string;
  game_id: string;
  owned: boolean;
  wishlisted: boolean;
  manual: boolean;
  platform: string | null;
  playtime_minutes: number;
  last_played_at: string | null;
  status: "backlog" | "playing" | "finished" | "dropped" | null;
  score: number | null;
  loved: string | null;
  disliked: string | null;
  rated_at: string | null;
  liked_aspects: string[];
  disliked_aspects: string[];
  rate_skipped_at: string | null;
};

/** Spalten, die für Listen reichen (ohne große Texte/Embeddings). */
export const GAME_LIST_COLUMNS =
  "id, steam_appid, title, header_image, short_description, genres, tags, release_year, review_positive, review_negative, analyzed_at, analysis_error";

export type GameListItem = Pick<
  GameRow,
  | "id"
  | "steam_appid"
  | "title"
  | "header_image"
  | "short_description"
  | "genres"
  | "tags"
  | "release_year"
  | "review_positive"
  | "review_negative"
  | "analyzed_at"
  | "analysis_error"
>;
