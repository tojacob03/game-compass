-- Fertiges Deal-Ergebnis pro Person (30 min), damit die Seite nicht jedes Mal den ganzen Katalog rankt
create table public.user_deals (
  user_id uuid primary key references public.users (id) on delete cascade,
  result jsonb not null,
  computed_at timestamptz not null default now()
);
alter table public.user_deals enable row level security;
revoke all on public.user_deals from anon, authenticated;
