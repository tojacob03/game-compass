-- Steam-Familie: Mitglieder OHNE GameCompass-Konto (Spiele per öffentlichem Steam-Profil, CSV oder manuell)
create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null,
  steam_id text,                       -- SteamID64, falls bekannt (Spiele werden geladen, wenn das Profil öffentlich ist)
  last_synced_at timestamptz,
  sync_error text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index family_members_group_idx on public.family_members (group_id);

create table public.family_member_games (
  member_id uuid not null references public.family_members (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  source text not null default 'manual' check (source in ('steam', 'csv', 'manual')),
  added_at timestamptz not null default now(),
  primary key (member_id, game_id)
);
create index family_member_games_game_idx on public.family_member_games (game_id);

alter table public.family_members enable row level security;
alter table public.family_member_games enable row level security;
revoke all on public.family_members from anon, authenticated;
revoke all on public.family_member_games from anon, authenticated;

-- Familien-Bibliothek: Spiele angemeldeter Mitglieder + Spiele der Mitglieder ohne Konto
create or replace function public.family_library(p_user uuid)
returns table (game_id uuid, owner_names text[])
language sql
stable
set search_path = public
as $$
  with fam as (
    select g.id from group_members me join groups g on g.id = me.group_id and g.is_steam_family where me.user_id = p_user
  ),
  owned as (
    select ug.game_id, u.display_name as owner
      from fam
      join group_members other on other.group_id = fam.id and other.user_id <> p_user
      join user_games ug on ug.user_id = other.user_id and ug.owned
      join users u on u.id = other.user_id
    union all
    select fmg.game_id, fm.name
      from fam
      join family_members fm on fm.group_id = fam.id
      join family_member_games fmg on fmg.member_id = fm.id
  )
  select o.game_id, array_agg(distinct o.owner order by o.owner)
    from owned o
   where not exists (select 1 from user_games mine where mine.user_id = p_user and mine.game_id = o.game_id and mine.owned)
   group by o.game_id
   order by o.game_id;
$$;
