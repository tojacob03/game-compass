-- Getrennte KI-Budgets: einmalige (geteilte) Spiel-Analysen vs. interaktive Nutzung (Profil, Empfehlungen, Chat)
alter table public.ai_usage add column kind text not null default 'analysis' check (kind in ('analysis', 'interactive'));
alter table public.ai_usage drop constraint ai_usage_pkey;
alter table public.ai_usage add primary key (user_id, day, kind);

drop function public.consume_ai(uuid, integer, integer);

create function public.consume_ai(p_user uuid, p_units integer, p_limit integer, p_kind text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v integer;
begin
  insert into ai_usage (user_id, day, kind, units) values (p_user, current_date, p_kind, p_units)
  on conflict (user_id, day, kind) do update set units = ai_usage.units + excluded.units
  returning units into v;
  if v > p_limit then
    update ai_usage set units = units - p_units where user_id = p_user and day = current_date and kind = p_kind;
    return false;
  end if;
  return true;
end;
$$;

revoke execute on function public.consume_ai(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.consume_ai(uuid, integer, integer, text) to service_role;
