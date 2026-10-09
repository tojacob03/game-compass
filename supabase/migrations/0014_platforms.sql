-- Plattformen: Windows/Mac/Linux + Steam-Deck-Einstufung (Steam) und GeForce NOW (offizielle NVIDIA-Liste)
alter table public.games
  add column plat_windows boolean,
  add column plat_mac boolean,
  add column plat_linux boolean,
  add column deck_compat smallint,          -- 0 unbekannt, 1 nicht unterstützt, 2 spielbar, 3 verifiziert
  add column gfn_store text,                -- Shop, über den das Spiel bei GeForce NOW läuft (null = nicht verfügbar)
  add column platforms_fetched_at timestamptz;

-- Worauf die Person spielt (windows, mac, linux, deck, gfn)
alter table public.users add column platforms text[] not null default '{windows}';

create table public.gfn_games (
  id bigint primary key,
  title text not null,
  title_norm text not null,
  steam_appid integer,
  store text,
  status text,
  fetched_at timestamptz not null default now()
);
create index gfn_games_steam_idx on public.gfn_games (steam_appid);
create index gfn_games_title_idx on public.gfn_games (title_norm);
alter table public.gfn_games enable row level security;
revoke all on public.gfn_games from anon, authenticated;

-- Bilder + Plattformen in einem Rutsch (gleicher Steam-Aufruf); GFN per Steam-AppID
create or replace function public.set_game_assets(p jsonb)
returns void
language sql
set search_path = public
as $$
  update games g
     set header_image = coalesce(e->>'header', g.header_image),
         capsule_image = e->>'capsule',
         hero_image = e->>'hero',
         assets_fetched_at = now(),
         plat_windows = case when e ? 'windows' then (e->>'windows')::boolean else g.plat_windows end,
         plat_mac = case when e ? 'mac' then (e->>'mac')::boolean else g.plat_mac end,
         plat_linux = case when e ? 'linux' then (e->>'linux')::boolean else g.plat_linux end,
         deck_compat = case when e ? 'deck' then (e->>'deck')::smallint else g.deck_compat end,
         platforms_fetched_at = case when e ? 'windows' then now() else g.platforms_fetched_at end,
         gfn_store = coalesce((select x.store from gfn_games x where x.steam_appid = g.steam_appid limit 1), g.gfn_store)
    from jsonb_array_elements(p) e
   where g.steam_appid = (e->>'appid')::int;
$$;

-- GFN-Zuordnung gesammelt setzen (nach dem täglichen Abgleich der NVIDIA-Liste)
create function public.set_gfn(p jsonb)
returns void
language sql
set search_path = public
as $$
  update games g set gfn_store = nullif(e->>'store', '')
    from jsonb_array_elements(p) e
   where g.id = (e->>'id')::uuid;
$$;
revoke execute on function public.set_gfn(jsonb) from public, anon, authenticated;
grant execute on function public.set_gfn(jsonb) to service_role;
