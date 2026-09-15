-- Cinema card UX: server-backed "Want to go" / Planned state.
-- Additive only. Repository presence does not imply production application.

create table if not exists public.cinema_user_plans (
  user_key text not null references public.app_users(user_key) on delete cascade,
  city_id text not null,
  movie_id uuid not null references public.cinema_movies(id) on delete cascade,
  planned_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_key, city_id, movie_id),
  constraint cinema_user_plans_city_id_check
    check (city_id = btrim(city_id) and char_length(city_id) between 1 and 80)
);

create index if not exists cinema_user_plans_user_date_idx
on public.cinema_user_plans(user_key, planned_date, updated_at desc);

alter table public.cinema_user_plans enable row level security;
revoke all on table public.cinema_user_plans from public, anon, authenticated;
grant select, insert, update, delete on table public.cinema_user_plans to service_role;

create or replace function public.go_irl_list_my_cinema_plans()
returns table (
  city_id text,
  movie_id uuid,
  planned_date date,
  saved_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
begin
  if v_user_key is null then
    return;
  end if;

  return query
  select
    plan.city_id,
    plan.movie_id,
    plan.planned_date,
    plan.created_at,
    plan.updated_at
  from public.cinema_user_plans plan
  where plan.user_key = v_user_key
  order by plan.planned_date, plan.created_at;
end;
$$;

create or replace function public.go_irl_set_my_cinema_plan(
  p_city_id text,
  p_movie_id uuid,
  p_planned_date date
)
returns table (
  status text,
  city_id text,
  movie_id uuid,
  planned_date date,
  saved_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_plan public.cinema_user_plans%rowtype;
begin
  if v_user_key is null then
    raise exception 'authenticated cinema plan required' using errcode = '42501';
  end if;
  if p_city_id is null or btrim(p_city_id) = '' then
    raise exception 'city_id is required' using errcode = '22023';
  end if;
  if p_movie_id is null or p_planned_date is null then
    raise exception 'movie_id and planned_date are required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.cinema_screenings screening
    join public.cinema_venues venue on venue.id = screening.cinema_id
    where screening.movie_id = p_movie_id
      and venue.city_id = btrim(p_city_id)
      and screening.status in ('scheduled', 'sold_out', 'active')
      and screening.starts_at >= now() - interval '30 minutes'
      and (screening.starts_at at time zone coalesce(venue.timezone, 'Europe/Prague'))::date = p_planned_date
  ) then
    raise exception 'cinema plan must match an upcoming screening date in the selected city' using errcode = '22023';
  end if;

  insert into public.cinema_user_plans (user_key, city_id, movie_id, planned_date)
  values (v_user_key, btrim(p_city_id), p_movie_id, p_planned_date)
  on conflict (user_key, city_id, movie_id) do update
  set planned_date = excluded.planned_date,
      updated_at = now()
  returning * into v_plan;

  return query select
    'saved'::text,
    v_plan.city_id,
    v_plan.movie_id,
    v_plan.planned_date,
    v_plan.created_at,
    v_plan.updated_at;
end;
$$;

create or replace function public.go_irl_remove_my_cinema_plan(
  p_city_id text,
  p_movie_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_removed integer := 0;
begin
  if v_user_key is null then
    raise exception 'authenticated cinema plan required' using errcode = '42501';
  end if;

  delete from public.cinema_user_plans plan
  where plan.user_key = v_user_key
    and plan.city_id = btrim(p_city_id)
    and plan.movie_id = p_movie_id;
  get diagnostics v_removed = row_count;
  return v_removed > 0;
end;
$$;

revoke all on function public.go_irl_list_my_cinema_plans() from public, anon;
revoke all on function public.go_irl_set_my_cinema_plan(text, uuid, date) from public, anon;
revoke all on function public.go_irl_remove_my_cinema_plan(text, uuid) from public, anon;

grant execute on function public.go_irl_list_my_cinema_plans() to authenticated, service_role;
grant execute on function public.go_irl_set_my_cinema_plan(text, uuid, date) to authenticated, service_role;
grant execute on function public.go_irl_remove_my_cinema_plan(text, uuid) to authenticated, service_role;
