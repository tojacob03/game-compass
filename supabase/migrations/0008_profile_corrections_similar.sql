-- Korrekturen am KI-Profil durch die Person selbst ("stimmt" / "stimmt nicht")
create table public.profile_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('driver', 'aversion')),
  mode_key text,                 -- null = modusübergreifend (globale Abneigung)
  name text not null,
  verdict text not null check (verdict in ('confirm', 'reject')),
  created_at timestamptz not null default now()
);
create unique index profile_corrections_unique on public.profile_corrections (user_id, kind, coalesce(mode_key, ''), lower(name));
alter table public.profile_corrections enable row level security;
revoke all on public.profile_corrections from anon, authenticated;

-- "Warum genau?": die ähnlichsten eigenen Spiele zu einer Empfehlung
alter table public.recommendations add column similar_to jsonb not null default '[]';
