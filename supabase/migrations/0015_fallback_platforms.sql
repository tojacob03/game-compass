-- Ausweich-Plattformen: dort spielt man nur für besonders passende Spiele/Deals (z. B. Windows neben Mac + GeForce NOW)
alter table public.users add column fallback_platforms text[] not null default '{}';
