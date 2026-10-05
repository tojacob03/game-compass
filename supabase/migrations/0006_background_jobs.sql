-- Hintergrund-Jobs: laufen serverseitig in Etappen weiter, unabhängig davon, ob die Seite offen ist
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('analyze', 'profile', 'recommend')),
  mode_key text,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'cancelled')),
  stage text,
  progress_done integer not null default 0,
  progress_total integer not null default 0,
  message text,
  run_id uuid references public.recommendation_runs (id) on delete set null,
  error text,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_user_idx on public.jobs (user_id, created_at desc);
-- Pro Nutzer und Art höchstens ein aktiver Job (verhindert Doppelstarts)
create unique index jobs_one_active on public.jobs (user_id, kind) where status in ('queued', 'running');
alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;

-- Exklusive Arbeits-Lease für eine Etappe (nur ein Worker gleichzeitig pro Job)
create function public.claim_job(p_id uuid, p_seconds integer)
returns boolean
language sql
set search_path = public
as $$
  with c as (
    update jobs
       set lease_until = now() + make_interval(secs => p_seconds),
           status = case when status = 'queued' then 'running' else status end,
           updated_at = now()
     where id = p_id
       and status in ('queued', 'running')
       and (lease_until is null or lease_until < now())
    returning 1
  )
  select exists (select 1 from c);
$$;
revoke execute on function public.claim_job(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_job(uuid, integer) to service_role;
