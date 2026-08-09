create or replace function public.go_irl_list_public_activity_previews_v2(
  p_requested_city_id text default 'olomouc',
  p_limit integer default 100
)
returns table (
  id uuid,
  category_id text,
  activity_ru text,
  activity_cs text,
  title_ru text,
  title_cs text,
  description_ru text,
  description_cs text,
  event_date date,
  event_time time,
  city_id text,
  address text,
  activity_type text,
  price integer,
  capacity integer,
  participant_count bigint,
  urgent boolean,
  popular boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    activity.id,
    activity.category_id,
    activity.activity_ru,
    activity.activity_cs,
    activity.title_ru,
    activity.title_cs,
    activity.description_ru,
    activity.description_cs,
    activity.event_date,
    activity.event_time,
    activity.city_id,
    activity.address,
    activity.activity_type,
    activity.price,
    activity.capacity,
    (
      select count(*)
      from public.activity_members member
      where member.activity_id = activity.id
        and member.status = 'joined'
    ) as participant_count,
    activity.urgent,
    activity.popular
  from public.activities activity
  where activity.visibility = 'public'
    and activity.title_ru <> '__go_irl_deleted__'
    and activity.title_cs <> '__go_irl_deleted__'
    and activity.event_date >= (now() at time zone 'Europe/Prague')::date
    and activity.city_id = coalesce(nullif(trim(p_requested_city_id), ''), 'olomouc')
  order by activity.event_date, activity.event_time, activity.id
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
$$;

revoke all on function public.go_irl_list_public_activity_previews_v2(text, integer) from public;
grant execute on function public.go_irl_list_public_activity_previews_v2(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
