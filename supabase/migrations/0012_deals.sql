-- Deals: Preise von IsThereAnyDeal (alle offiziellen Shops inkl. Steam), zwischengespeichert pro Spiel
alter table public.games add column itad_id text;
alter table public.games add column itad_checked_at timestamptz;

create table public.game_prices (
  game_id uuid primary key references public.games (id) on delete cascade,
  country text not null,
  deals jsonb not null default '[]',        -- [{shop, price, regular, cut, url, expiry, voucher}], günstigster zuerst
  history_low jsonb,                         -- {all, y1, m3} in Landeswährung
  bundles jsonb,                             -- aktive Bundles, die das Spiel enthalten (null = noch nicht geladen)
  fetched_at timestamptz not null default now(),
  bundles_fetched_at timestamptz
);
alter table public.game_prices enable row level security;
revoke all on public.game_prices from anon, authenticated;
