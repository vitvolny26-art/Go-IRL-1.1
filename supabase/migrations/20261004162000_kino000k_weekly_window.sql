begin;

create or replace function public.cinema_get_or_create_weekly_publication_selection(
  p_city_id text,
  p_week_start date,
  p_week_end date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_selection_id uuid;
begin
  if p_city_id is null
     or btrim(p_city_id) = ''
     or length(btrim(p_city_id)) > 80 then
    raise exception 'cinema_weekly_window_city_invalid';
  end if;

  if p_week_start is null
     or p_week_end is null
     or p_week_end <> p_week_start + 6
     or extract(isodow from p_week_start) <> 1
     or extract(isodow from p_week_end) <> 7 then
    raise exception 'cinema_weekly_window_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cinema_weekly_window:' || btrim(p_city_id) || ':' || p_week_start::text,
      0
    )
  );

  select id into v_selection_id
  from public.cinema_weekly_publication_selections
  where city_id = btrim(p_city_id)
    and week_start = p_week_start
    and week_end = p_week_end
  for update;

  if v_selection_id is not null then
    return v_selection_id;
  end if;

  insert into public.cinema_weekly_publication_selections(
    city_id,
    week_start,
    week_end,
    state,
    top_limit
  )
  values (
    btrim(p_city_id),
    p_week_start,
    p_week_end,
    'collecting',
    10
  )
  returning id into v_selection_id;

  return v_selection_id;
end;
$function$;

revoke all on function public.cinema_get_or_create_weekly_publication_selection(text,date,date)
  from public, anon, authenticated;
grant execute on function public.cinema_get_or_create_weekly_publication_selection(text,date,date)
  to service_role;

comment on function public.cinema_get_or_create_weekly_publication_selection(text,date,date) is
  'Kino000K service-role-only idempotent weekly window identity. Accepts exactly one Monday-Sunday calendar week and creates only a collecting selection; it does not rank candidates or authorize publication.';

notify pgrst, 'reload schema';

commit;
