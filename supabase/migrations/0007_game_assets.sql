-- Echte Steam-Asset-URLs (neuere Spiele haben Hash-Pfade; die alte /header.jpg-URL liefert dort 404)
alter table public.games add column capsule_image text;   -- Hochformat-Cover (Bibliothek 600x900)
alter table public.games add column hero_image text;      -- breites Hero-Bild für Hintergründe
alter table public.games add column assets_fetched_at timestamptz;

-- Viele Spiele auf einmal aktualisieren: [{appid, header, capsule, hero}]
create function public.set_game_assets(p jsonb)
returns void
language sql
set search_path = public
as $$
  update games g
     set header_image = coalesce(e->>'header', g.header_image),
         capsule_image = e->>'capsule',
         hero_image = e->>'hero',
         assets_fetched_at = now()
    from jsonb_array_elements(p) e
   where g.steam_appid = (e->>'appid')::int;
$$;
revoke execute on function public.set_game_assets(jsonb) from public, anon, authenticated;
grant execute on function public.set_game_assets(jsonb) to service_role;
