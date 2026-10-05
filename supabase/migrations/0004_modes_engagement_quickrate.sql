-- Engagement: typische Spielzeit (SteamSpy-Median) + KI-Chips für die Schnell-Bewertung
alter table public.games add column median_playtime_minutes integer;
alter table public.games add column chips jsonb;   -- {"loved": [...], "criticized": [...]} kurze Aspekte

-- Schnell-Bewertung: angetippte Aspekte + "nicht richtig gespielt"
alter table public.user_games add column liked_aspects text[] not null default '{}';
alter table public.user_games add column disliked_aspects text[] not null default '{}';
alter table public.user_games add column rate_skipped_at timestamptz;

-- Spielmodi
alter table public.taste_intents add column mode_key text;
alter table public.recommendation_runs add column mode_key text;
alter table public.recommendations add column mode_key text;

-- Alte Ein-Profil-Variante neu berechnen lassen
update public.taste_profiles set stale = true where profile->'modes' is null;
