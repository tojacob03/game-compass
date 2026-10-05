-- Software (Wallpaper Engine, Aseprite, …) ist kein Spiel: aus Modi, Empfehlungen und Ähnlichkeiten heraushalten
alter table public.games add column is_software boolean generated always as (
  genres && array['Utilities','Design & Illustration','Animation & Modeling','Video Production','Audio Production',
                  'Software Training','Web Publishing','Game Development','Photo Editing','Accounting']::text[]
  or tags[1:8] && array['Software','Utilities']::text[]
) stored;

create or replace function public.match_new_games(p_user uuid, p_query extensions.vector(768), p_count integer)
returns table (game_id uuid, similarity double precision)
language sql
stable
set search_path = public, extensions
as $$
  select g.id, 1 - (g.essence_embedding <=> p_query)
  from games g
  where g.essence_embedding is not null
    and not g.is_software
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

create or replace function public.match_my_games(p_user uuid, p_query extensions.vector(768), p_filter text, p_count integer)
returns table (game_id uuid, similarity double precision)
language sql
stable
set search_path = public, extensions
as $$
  select g.id, 1 - (g.essence_embedding <=> p_query)
  from games g
  join user_games ug on ug.game_id = g.id and ug.user_id = p_user
  where g.essence_embedding is not null
    and not g.is_software
    and case p_filter
      when 'backlog' then (ug.owned or ug.manual) and ug.playtime_minutes < 120 and coalesce(ug.status, '') not in ('finished', 'dropped')
      when 'wishlist' then ug.wishlisted
      else (ug.owned or ug.manual or ug.wishlisted)
    end
  order by g.essence_embedding <=> p_query
  limit p_count;
$$;

-- Katalog-Durchschnitt ohne Software
create or replace function public.catalog_mean_embedding()
returns extensions.vector
language sql
stable
set search_path = public, extensions
as $$
  select avg(essence_embedding) from games where essence_embedding is not null and not is_software;
$$;
