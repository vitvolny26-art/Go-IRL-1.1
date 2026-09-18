-- Akce001B: durable City Posters Planned intent for canonical events.
-- Repository migration only. DO NOT apply to production without separate explicit production migration approval.

begin;

do $prerequisites$
begin
  if to_regclass('public.city_posters_events') is null then
    raise exception 'Akce001B prerequisite missing: public.city_posters_events';
  end if;
  if to_regclass('public.app_users') is null then
    raise exception 'Akce001B prerequisite missing: public.app_users';
  end if;
  if to_regprocedure('public.go_irl_auth_user_key()') is null then
    raise exception 'Akce001B prerequisite missing: public.go_irl_auth_user_key()';
  end if;
end
$prerequisites$;

create table if not exists public.city_posters_user_plans (
  user_key text not null references public.app_users(user_key) on delete cascade,
  event_id uuid not null references public.city_posters_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_key, event_id)
);

create index if not exists city_posters_user_plans_user_updated_idx
  on public.city_posters_user_plans(user_key, updated_at desc);

alter table public.city_posters_user_plans enable row level security;
revoke all on table public.city_posters_user_plans from public, anon, authenticated;
grant select, insert, update, delete on table public.city_posters_user_plans to service_role;

create policy "city posters plans own read"
on public.city_posters_user_plans
for select to authenticated
using (user_key = (select public.go_irl_auth_user_key()));

create policy "city posters plans own insert"
on public.city_posters_user_plans
for insert to authenticated
with check (user_key = (select public.go_irl_auth_user_key()));

create policy "city posters plans own delete"
on public.city_posters_user_plans
for delete to authenticated
using (user_key = (select public.go_irl_auth_user_key()));

grant select, insert, delete on table public.city_posters_user_plans to authenticated;

create or replace function public.go_irl_list_my_city_posters_plans(
  p_city_id text,
  p_language text default 'en'
)
returns table (
  event_id uuid,
  canonical_slug text,
  vertical text,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  hero_media_url text,
  organizer_name text,
  occurrence_url text,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    event.id,
    event.canonical_slug,
    event.vertical,
    translation.title,
    translation.description,
    occurrence.starts_at,
    occurrence.ends_at,
    occurrence.timezone,
    event.hero_media_url,
    event.organizer_name,
    occurrence.occurrence_url,
    plan.created_at
  from public.city_posters_user_plans plan
  join public.city_posters_events event on event.id = plan.event_id
  join lateral (
    select candidate.starts_at, candidate.ends_at, candidate.timezone, candidate.occurrence_url
    from public.city_posters_occurrences candidate
    where candidate.event_id = event.id
      and candidate.status in ('scheduled','postponed','rescheduled')
      and coalesce(candidate.ends_at, candidate.starts_at + interval '3 hours') >= now()
    order by candidate.starts_at
    limit 1
  ) occurrence on true
  join lateral (
    select candidate.title, candidate.description
    from public.city_posters_event_translations candidate
    where candidate.event_id = event.id
    order by case
      when candidate.language = p_language then 0
      when candidate.language = 'en' then 1
      when candidate.language = 'ru' then 2
      else 3
    end, candidate.language
    limit 1
  ) translation on true
  where plan.user_key = public.go_irl_auth_user_key()
    and event.status = 'published'
    and event.city_id = btrim(p_city_id)
  order by occurrence.starts_at, plan.created_at;
$$;

create or replace function public.go_irl_set_my_city_posters_plan_by_slug(
  p_city_id text,
  p_canonical_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_event_id uuid;
begin
  if v_user_key is null then
    raise exception 'authenticated city posters plan required' using errcode = '42501';
  end if;

  select event.id into v_event_id
  from public.city_posters_events event
  where event.city_id = btrim(p_city_id)
    and event.canonical_slug = btrim(p_canonical_slug)
    and event.status = 'published'
    and exists (
      select 1 from public.city_posters_occurrences occurrence
      where occurrence.event_id = event.id
        and occurrence.status in ('scheduled','postponed','rescheduled')
        and coalesce(occurrence.ends_at, occurrence.starts_at + interval '3 hours') >= now()
    )
  limit 1;

  if v_event_id is null then
    raise exception 'active city posters event not found' using errcode = '22023';
  end if;

  insert into public.city_posters_user_plans(user_key, event_id)
  values (v_user_key, v_event_id)
  on conflict (user_key, event_id) do update set updated_at = now();

  return v_event_id;
end;
$$;

create or replace function public.go_irl_remove_my_city_posters_plan(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_removed integer := 0;
begin
  if v_user_key is null then
    raise exception 'authenticated city posters plan required' using errcode = '42501';
  end if;
  delete from public.city_posters_user_plans
  where user_key = v_user_key and event_id = p_event_id;
  get diagnostics v_removed = row_count;
  return v_removed > 0;
end;
$$;

revoke all on function public.go_irl_list_my_city_posters_plans(text,text) from public, anon;
revoke all on function public.go_irl_set_my_city_posters_plan_by_slug(text,text) from public, anon;
revoke all on function public.go_irl_remove_my_city_posters_plan(uuid) from public, anon;
grant execute on function public.go_irl_list_my_city_posters_plans(text,text) to authenticated, service_role;
grant execute on function public.go_irl_set_my_city_posters_plan_by_slug(text,text) to authenticated, service_role;
grant execute on function public.go_irl_remove_my_city_posters_plan(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
