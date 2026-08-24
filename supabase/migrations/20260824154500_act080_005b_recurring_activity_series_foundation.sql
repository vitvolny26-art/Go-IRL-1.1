-- ACT080-005B: weekly recurring Activity series foundation.
-- Repository patch only. Do not apply to production without a separate deploy/apply approval.
-- Each recurrence is materialized as an ordinary public.activities row so participants,
-- reminders, sharing, discovery, and Telegram/event-chat bindings stay occurrence-scoped.

begin;

create table if not exists public.activity_series (
  id uuid primary key default gen_random_uuid(),
  organizer_key text not null,
  organizer text not null,
  idempotency_key text not null,
  category_id text not null,
  activity_ru text not null,
  activity_cs text not null,
  title_ru text not null,
  title_cs text not null,
  description_ru text not null default '',
  description_cs text not null default '',
  first_event_date date not null,
  event_time time not null,
  weekday smallint not null check (weekday between 1 and 7),
  until_date date,
  occurrence_count smallint,
  city_id text not null default 'olomouc',
  address text not null,
  location_url text,
  participant_note text,
  activity_type text not null default 'custom'
    check (activity_type in ('sport', 'dating', 'friends', 'food', 'travel', 'culture', 'local', 'custom')),
  metadata jsonb not null default '{}'::jsonb,
  price integer not null default 0 check (price between 0 and 100000),
  capacity integer not null check (capacity between 2 and 100),
  visibility text not null default 'public' check (visibility in ('public', 'private', 'invite')),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_series_weekday_matches_start check (
    extract(isodow from first_event_date)::smallint = weekday
  ),
  constraint activity_series_finite_boundary check (
    (
      until_date is not null
      and occurrence_count is null
      and until_date >= first_event_date
      and until_date <= first_event_date + (7 * 103)
    )
    or (
      until_date is null
      and occurrence_count between 1 and 104
    )
  )
);

create unique index if not exists activity_series_owner_idempotency_idx
on public.activity_series(organizer_key, idempotency_key);

create index if not exists activity_series_owner_start_idx
on public.activity_series(organizer_key, first_event_date);

alter table public.activities
add column if not exists series_id uuid references public.activity_series(id) on delete restrict;

alter table public.activities
add column if not exists series_occurrence_no integer;

alter table public.activities
add column if not exists series_occurrence_status text;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'activities_series_occurrence_link_check'
      and conrelid = 'public.activities'::regclass
  ) then
    alter table public.activities
      add constraint activities_series_occurrence_link_check check (
        (
          series_id is null
          and series_occurrence_no is null
          and series_occurrence_status is null
        )
        or (
          series_id is not null
          and series_occurrence_no >= 1
          and series_occurrence_status in ('scheduled', 'cancelled')
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'activities_series_occurrence_number_unique'
      and conrelid = 'public.activities'::regclass
  ) then
    alter table public.activities
      add constraint activities_series_occurrence_number_unique
      unique (series_id, series_occurrence_no);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'activities_series_occurrence_date_unique'
      and conrelid = 'public.activities'::regclass
  ) then
    alter table public.activities
      add constraint activities_series_occurrence_date_unique
      unique (series_id, event_date);
  end if;
end
$constraints$;

create index if not exists activities_series_date_idx
on public.activities(series_id, event_date)
where series_id is not null;

drop trigger if exists activity_series_touch_updated_at on public.activity_series;
create trigger activity_series_touch_updated_at
before update on public.activity_series
for each row
execute function public.go_irl_touch_updated_at();

-- Match AUTH001 protected-write behavior for this new product-write table.
drop trigger if exists auth001_require_onboarding_write on public.activity_series;
create trigger auth001_require_onboarding_write
before insert or update on public.activity_series
for each row
execute function go_irl_private.enforce_completed_first_onboarding_on_user_write();

alter table public.activity_series enable row level security;

create or replace function go_irl_private.activity_series_link_is_valid(
  p_series_id uuid,
  p_organizer_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_series_id is null
    or exists (
      select 1
      from public.activity_series series
      where series.id = p_series_id
        and series.organizer_key = p_organizer_key
    );
$$;

revoke all on function go_irl_private.activity_series_link_is_valid(uuid, text) from public, anon;
grant execute on function go_irl_private.activity_series_link_is_valid(uuid, text) to authenticated;

drop policy if exists "activity series owner read" on public.activity_series;
create policy "activity series owner read"
on public.activity_series
for select
to authenticated
using (organizer_key = public.go_irl_auth_user_key());

-- Series mutations are RPC-only so clients cannot desynchronize a template from
-- materialized occurrences with direct table writes.
revoke all on table public.activity_series from anon;
revoke insert, update, delete on table public.activity_series from authenticated;
grant select on table public.activity_series to authenticated;

-- Preserve the current authenticated Activities ownership/moderation contract while
-- preventing cross-owner series linkage through direct public.activities writes.
drop policy if exists "public activities create" on public.activities;
create policy "public activities create"
on public.activities
for insert
to authenticated
with check (
  organizer_key = public.go_irl_auth_user_key()
  and go_irl_private.activity_series_link_is_valid(series_id, organizer_key)
);

drop policy if exists "organizer activities update" on public.activities;
create policy "organizer activities update"
on public.activities
for update
to authenticated
using (
  organizer_key = public.go_irl_auth_user_key()
  or private.go_irl_request_can_moderate()
)
with check (
  (
    organizer_key = public.go_irl_auth_user_key()
    or private.go_irl_request_can_moderate()
  )
  and go_irl_private.activity_series_link_is_valid(series_id, organizer_key)
);

create or replace function public.go_irl_create_weekly_activity_series(
  p_category_id text,
  p_activity_text text,
  p_title_text text,
  p_description_text text,
  p_start_date date,
  p_event_time time,
  p_city_id text,
  p_address text,
  p_location_url text,
  p_participant_note text,
  p_activity_type text,
  p_metadata jsonb,
  p_price integer,
  p_capacity integer,
  p_visibility text,
  p_organizer text,
  p_idempotency_key text,
  p_until_date date default null,
  p_occurrence_count smallint default null
)
returns table(series_id uuid, activity_ids uuid[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_series_id uuid;
  v_activity_ids uuid[];
  v_occurrence_count integer;
  v_weekday smallint;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_existing public.activity_series%rowtype;
begin
  if v_user_key is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not go_irl_private.has_completed_first_onboarding(v_user_key) then
    raise exception 'first_onboarding_required' using errcode = '42501';
  end if;

  if p_start_date is null or p_event_time is null then
    raise exception 'series_start_required';
  end if;

  if p_start_date < (now() at time zone 'Europe/Prague')::date then
    raise exception 'series_start_in_past';
  end if;

  if (p_until_date is null and p_occurrence_count is null)
    or (p_until_date is not null and p_occurrence_count is not null) then
    raise exception 'series_requires_exactly_one_boundary';
  end if;

  if p_occurrence_count is not null and (p_occurrence_count < 1 or p_occurrence_count > 104) then
    raise exception 'series_occurrence_count_out_of_range';
  end if;

  if p_until_date is not null and (
    p_until_date < p_start_date
    or p_until_date > p_start_date + (7 * 103)
  ) then
    raise exception 'series_until_date_out_of_range';
  end if;

  if nullif(btrim(p_category_id), '') is null
    or nullif(btrim(p_activity_text), '') is null
    or nullif(btrim(p_title_text), '') is null
    or nullif(btrim(p_city_id), '') is null
    or nullif(btrim(p_address), '') is null
    or nullif(btrim(p_organizer), '') is null then
    raise exception 'series_required_text_missing';
  end if;

  if char_length(v_idempotency_key) not between 16 and 160
    or v_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'invalid_series_idempotency_key';
  end if;

  -- Serialize retries with the same owner/key before the replay lookup. This makes
  -- concurrent network retries resolve to one durable series instead of a unique error.
  perform pg_advisory_xact_lock(hashtextextended(v_user_key || ':' || v_idempotency_key, 0));

  if p_activity_type not in ('sport', 'dating', 'friends', 'food', 'travel', 'culture', 'local', 'custom') then
    raise exception 'invalid_activity_type';
  end if;

  if p_visibility not in ('public', 'private', 'invite') then
    raise exception 'invalid_visibility';
  end if;

  if p_price < 0 or p_price > 100000 then
    raise exception 'invalid_price';
  end if;

  if p_capacity < 2 or p_capacity > 100 then
    raise exception 'invalid_capacity';
  end if;

  v_occurrence_count := case
    when p_occurrence_count is not null then p_occurrence_count::integer
    else ((p_until_date - p_start_date) / 7) + 1
  end;
  v_weekday := extract(isodow from p_start_date)::smallint;

  select *
  into v_existing
  from public.activity_series existing
  where existing.organizer_key = v_user_key
    and existing.idempotency_key = v_idempotency_key;

  if found then
    if v_existing.category_id <> p_category_id
      or v_existing.activity_ru <> p_activity_text
      or v_existing.title_ru <> p_title_text
      or v_existing.description_ru <> coalesce(p_description_text, '')
      or v_existing.first_event_date <> p_start_date
      or v_existing.event_time <> p_event_time
      or v_existing.until_date is distinct from p_until_date
      or v_existing.occurrence_count is distinct from p_occurrence_count
      or v_existing.city_id <> p_city_id
      or v_existing.address <> p_address
      or v_existing.location_url is distinct from nullif(btrim(coalesce(p_location_url, '')), '')
      or v_existing.participant_note is distinct from nullif(btrim(coalesce(p_participant_note, '')), '')
      or v_existing.activity_type <> p_activity_type
      or v_existing.metadata <> coalesce(p_metadata, '{}'::jsonb)
      or v_existing.price <> p_price
      or v_existing.capacity <> p_capacity
      or v_existing.visibility <> p_visibility
      or v_existing.organizer <> p_organizer then
      raise exception 'series_idempotency_key_reused_with_different_parameters' using errcode = '22023';
    end if;

    select array_agg(activity.id order by activity.series_occurrence_no)
    into v_activity_ids
    from public.activities activity
    where activity.series_id = v_existing.id;

    return query select v_existing.id, v_activity_ids;
    return;
  end if;

  insert into public.activity_series (
    organizer_key,
    organizer,
    idempotency_key,
    category_id,
    activity_ru,
    activity_cs,
    title_ru,
    title_cs,
    description_ru,
    description_cs,
    first_event_date,
    event_time,
    weekday,
    until_date,
    occurrence_count,
    city_id,
    address,
    location_url,
    participant_note,
    activity_type,
    metadata,
    price,
    capacity,
    visibility
  ) values (
    v_user_key,
    p_organizer,
    v_idempotency_key,
    p_category_id,
    p_activity_text,
    p_activity_text,
    p_title_text,
    p_title_text,
    coalesce(p_description_text, ''),
    coalesce(p_description_text, ''),
    p_start_date,
    p_event_time,
    v_weekday,
    p_until_date,
    p_occurrence_count,
    p_city_id,
    p_address,
    nullif(btrim(coalesce(p_location_url, '')), ''),
    nullif(btrim(coalesce(p_participant_note, '')), ''),
    p_activity_type,
    coalesce(p_metadata, '{}'::jsonb),
    p_price,
    p_capacity,
    p_visibility
  )
  returning id into v_series_id;

  with inserted as (
    insert into public.activities (
      category_id,
      activity_ru,
      activity_cs,
      title_ru,
      title_cs,
      description_ru,
      description_cs,
      event_date,
      event_time,
      city_id,
      address,
      location_url,
      participant_note,
      activity_type,
      metadata,
      price,
      capacity,
      organizer,
      organizer_key,
      visibility,
      urgent,
      popular,
      series_id,
      series_occurrence_no,
      series_occurrence_status
    )
    select
      p_category_id,
      p_activity_text,
      p_activity_text,
      p_title_text,
      p_title_text,
      coalesce(p_description_text, ''),
      coalesce(p_description_text, ''),
      p_start_date + (step * 7),
      p_event_time,
      p_city_id,
      p_address,
      nullif(btrim(coalesce(p_location_url, '')), ''),
      nullif(btrim(coalesce(p_participant_note, '')), ''),
      p_activity_type,
      coalesce(p_metadata, '{}'::jsonb),
      p_price,
      p_capacity,
      p_organizer,
      v_user_key,
      p_visibility,
      false,
      false,
      v_series_id,
      step + 1,
      'scheduled'
    from generate_series(0, v_occurrence_count - 1) as occurrence(step)
    returning id, series_occurrence_no
  )
  select array_agg(id order by series_occurrence_no)
  into v_activity_ids
  from inserted;

  insert into public.activity_members (
    activity_id,
    user_key,
    display_name,
    status
  )
  select
    activity_id,
    v_user_key,
    p_organizer,
    'joined'
  from unnest(v_activity_ids) as occurrence_activity(activity_id);

  return query select v_series_id, v_activity_ids;
end;
$$;

revoke all on function public.go_irl_create_weekly_activity_series(
  text, text, text, text, date, time, text, text, text, text,
  text, jsonb, integer, integer, text, text, text, date, smallint
) from public, anon;

grant execute on function public.go_irl_create_weekly_activity_series(
  text, text, text, text, date, time, text, text, text, text,
  text, jsonb, integer, integer, text, text, text, date, smallint
) to authenticated;

notify pgrst, 'reload schema';

commit;
