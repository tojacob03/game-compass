-- E-Mail-Benachrichtigungen für Deals und Bundles
alter table public.users add column email text;
alter table public.users add column email_verified_at timestamptz;
alter table public.users add column notify jsonb not null default '{"enabled": false, "bundles": true, "deals": true, "bundleRatio": 2.5}';

-- Was schon gemeldet wurde (keine Wiederholungen; Deals erneut nur bei niedrigerem Preis)
create table public.notification_log (
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('bundle', 'deal', 'verify', 'digest')),
  ref text not null,
  price numeric,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);
alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

-- Neuer Hintergrund-Job: täglicher Deal-/Bundle-Check
alter table public.jobs drop constraint jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check check (kind in ('analyze', 'profile', 'recommend', 'deals'));
