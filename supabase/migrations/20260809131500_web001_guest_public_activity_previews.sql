create or replace function public.go_irl_list_public_activity_previews(
  p_requested_city_id text default 'olomouc',
  p_limit integer default 8
)
returns table (
  id uuid,
  title_ru text,
  title_cs text,
  event_date date,
  event_time time,
  address text,
  price integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    activity.id,
    activity.title_ru,
    activity.title_cs,
    activity.event_date,
    activity.event_time,
    activity.address,
    activity.price
  from public.activities activity
  where activity.visibility = 'public'
    and activity.title_ru <> '__go_irl_deleted__'
    and activity.title_cs <> '__go_irl_deleted__'
    and activity.event_date >= (now() at time zone 'Europe/Prague')::date
    and activity.city_id = coalesce(nullif(trim(p_requested_city_id), ''), 'olomouc')
  order by activity.event_date, activity.event_time, activity.id
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

revoke all on function public.go_irl_list_public_activity_previews(text, integer) from public;
grant execute on function public.go_irl_list_public_activity_previews(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
