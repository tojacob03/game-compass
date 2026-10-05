-- Durchschnitts-Embedding des Katalogs: wird abgezogen ("Zentrierung"), damit beim Clustering
-- nur das Unterscheidende zählt (alle Essenz-Texte teilen Aufbau und Vokabular).
create function public.catalog_mean_embedding()
returns extensions.vector
language sql
stable
set search_path = public, extensions
as $$
  select avg(essence_embedding) from games where essence_embedding is not null;
$$;
revoke execute on function public.catalog_mean_embedding() from public, anon, authenticated;
grant execute on function public.catalog_mean_embedding() to service_role;
