-- GameCompass – Initiales Schema
--
-- Sicherheitsmodell: Der Browser spricht NIE direkt mit der Datenbank.
-- Alle Zugriffe laufen über Next.js-Server-Code mit dem Secret Key.
-- RLS ist auf allen Tabellen aktiv und es gibt bewusst KEINE Policies,
-- d. h. der öffentliche (publishable/anon) Key kann nichts lesen oder schreiben.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Nutzer (Login via Steam OpenID, Freischaltung durch Admin)
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key default gen_random_uuid(),
  steam_id text not null unique,
  display_name text not null,
  avatar_url text,
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  is_admin boolean not null default false,
  about_me text,                       -- Freitext: "Ich mag ..., ich hasse ..."
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Spiele (geteilter Katalog für alle Nutzer, inkl. KI-Analyse)
-- ---------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  steam_appid integer unique,          -- null bei manuellen Nicht-Steam-Spielen
  title text not null,
  header_image text,
  short_description text,
  about text,                          -- bereinigte Store-Beschreibung (gekürzt)
  genres text[] not null default '{}',
  tags text[] not null default '{}',   -- Steam-Community-Tags (SteamSpy), nach Votes sortiert
  developers text[] not null default '{}',
  release_year integer,
  review_positive integer,
  review_negative integer,
  metadata_fetched_at timestamptz,

  -- KI-"Essenz": abstrakte, genre-übergreifende Eigenschaften des Spiels
  essence jsonb,
  essence_text text,
  essence_embedding extensions.vector(768),
  essence_model text,
  analyzed_at timestamptz,
  analysis_error text,
  analysis_attempts integer not null default 0,

  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index games_title_idx on public.games (lower(title));
create index games_essence_hnsw on public.games using hnsw (essence_embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Beziehung Nutzer <-> Spiel (Besitz, Wunschliste, manuell, Bewertung)
-- ---------------------------------------------------------------------------
create table public.user_games (
  user_id uuid not null references public.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  owned boolean not null default false,       -- Steam-Bibliothek
  wishlisted boolean not null default false,  -- Steam-Wunschliste
  manual boolean not null default false,      -- manuell hinzugefügt (andere Plattform)
  platform text,                              -- 'steam', 'PS5', 'Switch', 'GOG', ...
  playtime_minutes integer not null default 0,
  last_played_at timestamptz,
  status text check (status in ('backlog', 'playing', 'finished', 'dropped')),
  -- Bewertung
  score smallint check (score between 1 and 10),
  loved text,                                 -- Freitext: was hat gefallen
  disliked text,                              -- Freitext: was hat gestört
  rated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index user_games_game_idx on public.user_games (game_id);

-- ---------------------------------------------------------------------------
-- Geschmacksprofil (KI-generiert) + Such-Vektoren (mehrere "Facetten")
-- ---------------------------------------------------------------------------
create table public.taste_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  profile jsonb not null,
  model text,
  stale boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.taste_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  label text not null,
  description text not null,
  weight real not null default 1,
  embedding extensions.vector(768) not null
);
create index taste_intents_user_idx on public.taste_intents (user_id);

-- ---------------------------------------------------------------------------
-- Empfehlungen + Feedback
-- ---------------------------------------------------------------------------
create table public.recommendation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'preparing' check (status in ('preparing', 'ready', 'failed')),
  candidate_ids uuid[] not null default '{}',
  candidate_sources jsonb not null default '{}',  -- game_id -> ["vector","llm","friends",...]
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index recommendation_runs_user_idx on public.recommendation_runs (user_id, created_at desc);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.recommendation_runs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  rank integer not null,
  fit integer not null,              -- 0..100
  headline text not null,
  why text not null,
  risks text,
  matched_drivers text[] not null default '{}',
  is_wildcard boolean not null default false,
  via_family boolean not null default false,
  created_at timestamptz not null default now()
);
create index recommendations_user_idx on public.recommendations (user_id, created_at desc);

create table public.rec_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  verdict text not null check (verdict in ('interested', 'not_interested', 'already_played')),
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, game_id)
);

-- ---------------------------------------------------------------------------
-- Gruppen (Freundeskreis / Steam-Familie)
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_steam_family boolean not null default false,
  invite_code text not null unique,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- ---------------------------------------------------------------------------
-- Analyse-Warteschlange + KI-Kontingent
-- ---------------------------------------------------------------------------
create table public.analysis_queue (
  game_id uuid not null references public.games (id) on delete cascade,
  requested_by uuid not null references public.users (id) on delete cascade,
  priority integer not null default 0,     -- höher = früher
  created_at timestamptz not null default now(),
  primary key (game_id, requested_by)
);

create table public.ai_usage (
  user_id uuid not null references public.users (id) on delete cascade,
  day date not null default current_date,
  units integer not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- RLS: an, ohne Policies => nur der Server (Secret Key) hat Zugriff
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.games enable row level security;
alter table public.user_games enable row level security;
alter table public.taste_profiles enable row level security;
alter table public.taste_intents enable row level security;
alter table public.recommendation_runs enable row level security;
alter table public.recommendations enable row level security;
alter table public.rec_feedback enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.analysis_queue enable row level security;
alter table public.ai_usage enable row level security;

-- ---------------------------------------------------------------------------
-- Funktionen
-- ---------------------------------------------------------------------------

-- Atomares KI-Kontingent pro Nutzer und Tag
create function public.consume_ai(p_user uuid, p_units integer, p_limit integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v integer;
begin
  insert into ai_usage (user_id, day, units) values (p_user, current_date, p_units)
  on conflict (user_id, day) do update set units = ai_usage.units + excluded.units
  returning units into v;
  if v > p_limit then
    update ai_usage set units = units - p_units where user_id = p_user and day = current_date;
    return false;
  end if;
  return true;
end;
$$;

-- Steam-Bibliothek + Wunschliste in einem Rutsch synchronisieren
-- p_owned:    [{appid, name, playtime, last_played}]
-- p_wishlist: [{appid, name}]
create function public.sync_steam_library(p_user uuid, p_owned jsonb, p_wishlist jsonb)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into games (steam_appid, title)
  select distinct on ((e->>'appid')::int) (e->>'appid')::int, coalesce(nullif(e->>'name', ''), 'App ' || (e->>'appid'))
  from jsonb_array_elements(p_owned || p_wishlist) e
  on conflict (steam_appid) do nothing;

  update user_games set owned = false where user_id = p_user and owned;
  update user_games set wishlisted = false where user_id = p_user and wishlisted;

  insert into user_games (user_id, game_id, owned, platform, playtime_minutes, last_played_at)
  select p_user, g.id, true, 'steam',
         coalesce((e->>'playtime')::int, 0),
         case when coalesce((e->>'last_played')::bigint, 0) > 0 then to_timestamp((e->>'last_played')::bigint) end
  from jsonb_array_elements(p_owned) e
  join games g on g.steam_appid = (e->>'appid')::int
  on conflict (user_id, game_id) do update
    set owned = true,
        platform = 'steam',
        playtime_minutes = excluded.playtime_minutes,
        last_played_at = excluded.last_played_at,
        updated_at = now();

  insert into user_games (user_id, game_id, wishlisted, platform)
  select p_user, g.id, true, 'steam'
  from jsonb_array_elements(p_wishlist) e
  join games g on g.steam_appid = (e->>'appid')::int
  on conflict (user_id, game_id) do update set wishlisted = true, updated_at = now();

  update users set last_synced_at = now() where id = p_user;
end;
$$;

-- Steam-Familie: Spiele anderer Familienmitglieder, die der Nutzer selbst nicht besitzt
create function public.family_library(p_user uuid)
returns table (game_id uuid, owner_names text[])
language sql
stable
set search_path = public
as $$
  select ug.game_id, array_agg(distinct u.display_name order by u.display_name)
  from group_members me
  join groups g on g.id = me.group_id and g.is_steam_family
  join group_members other on other.group_id = g.id and other.user_id <> p_user
  join user_games ug on ug.user_id = other.user_id and ug.owned
  join users u on u.id = other.user_id
  where me.user_id = p_user
    and not exists (
      select 1 from user_games mine
      where mine.user_id = p_user and mine.game_id = ug.game_id and mine.owned
    )
  group by ug.game_id
  order by ug.game_id;
$$;

-- Bewertungen aus allen Gruppen des Nutzers (Freunde-Signal)
create function public.group_ratings(p_user uuid)
returns table (game_id uuid, rater_name text, score smallint, loved text, disliked text)
language sql
stable
set search_path = public
as $$
  select distinct on (ug.game_id, ug.user_id) ug.game_id, u.display_name, ug.score, ug.loved, ug.disliked
  from group_members me
  join group_members other on other.group_id = me.group_id and other.user_id <> p_user
  join user_games ug on ug.user_id = other.user_id and ug.score is not null
  join users u on u.id = other.user_id and u.status = 'active'
  where me.user_id = p_user;
$$;

-- Vektor-Suche im gesamten Katalog, ohne Spiele, die der Nutzer schon kennt
create function public.match_new_games(p_user uuid, p_query extensions.vector(768), p_count integer)
returns table (game_id uuid, similarity double precision)
language sql
stable
set search_path = public, extensions
as $$
  select g.id, 1 - (g.essence_embedding <=> p_query)
  from games g
  where g.essence_embedding is not null
    and not exists (
      select 1 from user_games ug
      where ug.user_id = p_user and ug.game_id = g.id
        and (ug.owned or ug.manual or ug.wishlisted or ug.score is not null)
    )
    and not exists (
      select 1 from rec_feedback f
      where f.user_id = p_user and f.game_id = g.id and f.verdict <> 'interested'
    )
  order by g.essence_embedding <=> p_query
  limit p_count;
$$;

-- Vektor-Suche in der eigenen Bibliothek (für den Chat: "was soll ich spielen?")
create function public.match_my_games(p_user uuid, p_query extensions.vector(768), p_filter text, p_count integer)
returns table (game_id uuid, similarity double precision)
language sql
stable
set search_path = public, extensions
as $$
  select g.id, 1 - (g.essence_embedding <=> p_query)
  from games g
  join user_games ug on ug.game_id = g.id and ug.user_id = p_user
  where g.essence_embedding is not null
    and case p_filter
      when 'backlog' then (ug.owned or ug.manual) and ug.playtime_minutes < 120 and coalesce(ug.status, '') not in ('finished', 'dropped')
      when 'wishlist' then ug.wishlisted
      else (ug.owned or ug.manual or ug.wishlisted)
    end
  order by g.essence_embedding <=> p_query
  limit p_count;
$$;

-- Funktionen nur für den Server, nicht für anon/authenticated
revoke execute on function public.consume_ai(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.sync_steam_library(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.family_library(uuid) from public, anon, authenticated;
revoke execute on function public.group_ratings(uuid) from public, anon, authenticated;
revoke execute on function public.match_new_games(uuid, extensions.vector, integer) from public, anon, authenticated;
revoke execute on function public.match_my_games(uuid, extensions.vector, text, integer) from public, anon, authenticated;
grant execute on function public.consume_ai(uuid, integer, integer) to service_role;
grant execute on function public.sync_steam_library(uuid, jsonb, jsonb) to service_role;
grant execute on function public.family_library(uuid) to service_role;
grant execute on function public.group_ratings(uuid) to service_role;
grant execute on function public.match_new_games(uuid, extensions.vector, integer) to service_role;
grant execute on function public.match_my_games(uuid, extensions.vector, text, integer) to service_role;
