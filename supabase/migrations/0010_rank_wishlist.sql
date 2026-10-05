-- Wunschliste gegen Such-Facetten ranken – in der DB statt alle Vektoren zum Server zu schicken
create function public.rank_wishlist(p_user uuid, p_queries text[], p_weights real[])
returns table (game_id uuid, best_idx integer, best_sim double precision)
language sql
stable
set search_path = public, extensions
as $$
  with q as materialized (
    select v::extensions.vector(768) as v, idx::integer as idx, 0.8 + 0.05 * p_weights[idx] as w
    from unnest(p_queries) with ordinality as t(v, idx)
  ),
  scored as (
    select g.id, q.idx, (1 - (g.essence_embedding <=> q.v)) * q.w as s
    from user_games ug
    join games g on g.id = ug.game_id
    cross join q
    where ug.user_id = p_user and ug.wishlisted and g.essence_embedding is not null and not g.is_software
  )
  select distinct on (id) id, idx, s from scored order by id, s desc;
$$;
revoke execute on function public.rank_wishlist(uuid, text[], real[]) from public, anon, authenticated;
grant execute on function public.rank_wishlist(uuid, text[], real[]) to service_role;
