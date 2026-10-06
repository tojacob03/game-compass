-- Feintuning: Gewichte setzen und eigene Treiber/Abneigungen ergänzen
alter table public.profile_corrections add column weight smallint check (weight between 1 and 5);
alter table public.profile_corrections add column description text;
alter table public.profile_corrections drop constraint profile_corrections_verdict_check;
alter table public.profile_corrections add constraint profile_corrections_verdict_check
  check (verdict in ('confirm', 'reject', 'add'));

-- Vektoren nicht nur für Such-Facetten, sondern auch für Treiber und Abneigungen (Ranking)
alter table public.taste_intents add column kind text not null default 'intent'
  check (kind in ('intent', 'driver', 'aversion'));
alter table public.taste_intents add column name text;
create index taste_intents_user_kind_idx on public.taste_intents (user_id, kind);
