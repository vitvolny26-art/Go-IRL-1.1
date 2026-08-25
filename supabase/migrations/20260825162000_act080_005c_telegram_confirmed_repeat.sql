-- ACT080-005C / Activ003: Telegram-confirmed repeat publication foundation.
-- Repository-only migration. Do not apply to production without separate approval.

begin;

create table if not exists public.activity_repeat_chains (
  id uuid primary key default gen_random_uuid(),
  source_activity_id uuid not null unique references public.activities(id) on delete restrict,
  organizer_key text not null,
  create_idempotency_key text not null,
  repeat_enabled boolean not null default true,
  prompt_due_at timestamptz not null,
  prompt_sent_at timestamptz,
  decision text check (decision in ('yes','no')),
  decided_at timestamptz,
  next_activity_id uuid references public.activities(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organizer_key, create_idempotency_key)
);

create index if not exists activity_repeat_chains_due_idx
on public.activity_repeat_chains(prompt_due_at)
where repeat_enabled and prompt_sent_at is null and decision is null;

alter table public.activity_repeat_chains enable row level security;
revoke all on table public.activity_repeat_chains from public, anon, authenticated;

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
  v_chain_id uuid;
  v_activity_id uuid;
  v_existing public.activity_repeat_chains%rowtype;
  v_duration_minutes integer := greatest(1, coalesce((p_metadata #>> '{sport,durationMinutes}')::integer, 90));
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
begin
  if v_user_key is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not go_irl_private.has_completed_first_onboarding(v_user_key) then raise exception 'first_onboarding_required' using errcode = '42501'; end if;
  if p_start_date is null or p_event_time is null then raise exception 'repeat_start_required'; end if;
  if p_start_date < (now() at time zone 'Europe/Prague')::date then raise exception 'repeat_start_in_past'; end if;
  if nullif(btrim(p_category_id), '') is null or nullif(btrim(p_activity_text), '') is null
    or nullif(btrim(p_title_text), '') is null or nullif(btrim(p_city_id), '') is null
    or nullif(btrim(p_address), '') is null or nullif(btrim(p_organizer), '') is null then
    raise exception 'repeat_required_text_missing';
  end if;
  if char_length(v_idempotency_key) not between 16 and 160 or v_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'invalid_repeat_idempotency_key';
  end if;
  if p_activity_type not in ('sport','dating','friends','food','travel','culture','local','custom') then raise exception 'invalid_activity_type'; end if;
  if p_visibility not in ('public','private','invite') then raise exception 'invalid_visibility'; end if;
  if p_price < 0 or p_price > 100000 then raise exception 'invalid_price'; end if;
  if p_capacity < 2 or p_capacity > 100 then raise exception 'invalid_capacity'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_key || ':' || v_idempotency_key, 0));

  select * into v_existing
  from public.activity_repeat_chains
  where organizer_key = v_user_key and create_idempotency_key = v_idempotency_key;

  if found then
    return query select v_existing.id, array[v_existing.source_activity_id];
    return;
  end if;

  insert into public.activities (
    category_id, activity_ru, activity_cs, title_ru, title_cs,
    description_ru, description_cs, event_date, event_time, city_id,
    address, location_url, participant_note, activity_type, metadata,
    price, capacity, organizer, organizer_key, visibility, urgent, popular,
    series_id, series_occurrence_no, series_occurrence_status
  ) values (
    p_category_id, p_activity_text, p_activity_text, p_title_text, p_title_text,
    coalesce(p_description_text, ''), coalesce(p_description_text, ''), p_start_date, p_event_time, p_city_id,
    p_address, nullif(btrim(coalesce(p_location_url, '')), ''), nullif(btrim(coalesce(p_participant_note, '')), ''),
    p_activity_type, coalesce(p_metadata, '{}'::jsonb), p_price, p_capacity, p_organizer, v_user_key,
    p_visibility, false, false, null, null, null
  ) returning id into v_activity_id;

  insert into public.activity_members(activity_id, user_key, display_name, status)
  values (v_activity_id, v_user_key, p_organizer, 'joined');

  insert into public.activity_repeat_chains(
    source_activity_id, organizer_key, create_idempotency_key, repeat_enabled, prompt_due_at
  ) values (
    v_activity_id,
    v_user_key,
    v_idempotency_key,
    true,
    ((p_start_date::timestamp + p_event_time) at time zone 'Europe/Prague')
      + make_interval(mins => v_duration_minutes)
      + interval '24 hours'
  ) returning id into v_chain_id;

  return query select v_chain_id, array[v_activity_id];
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

create or replace function public.go_irl_claim_due_repeat_prompts(p_limit integer default 50)
returns table(
  chain_id uuid,
  activity_id uuid,
  organizer_key text,
  title text,
  city_id text,
  event_date date,
  event_time time
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select chain.id
    from public.activity_repeat_chains chain
    join public.activities activity on activity.id = chain.source_activity_id
    where chain.repeat_enabled
      and chain.decision is null
      and chain.prompt_sent_at is null
      and chain.prompt_due_at <= now()
      and activity.organizer_key = chain.organizer_key
      and activity.visibility <> 'private'
    order by chain.prompt_due_at
    for update of chain skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), claimed as (
    update public.activity_repeat_chains chain
    set prompt_sent_at = now(), updated_at = now()
    from due
    where chain.id = due.id
    returning chain.*
  )
  select claimed.id, activity.id, claimed.organizer_key,
    coalesce(nullif(activity.title_cs, ''), nullif(activity.title_ru, ''), 'GO IRL event'),
    activity.city_id, activity.event_date, activity.event_time
  from claimed
  join public.activities activity on activity.id = claimed.source_activity_id;
end;
$$;

revoke all on function public.go_irl_claim_due_repeat_prompts(integer) from public, anon, authenticated;

create or replace function public.go_irl_repeat_activity_decision(
  p_chain_id uuid,
  p_actor_user_key text,
  p_decision text
)
returns table(created_activity_id uuid, repeat_enabled boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chain public.activity_repeat_chains%rowtype;
  v_source public.activities%rowtype;
  v_created uuid;
  v_next_chain_id uuid;
  v_duration_minutes integer;
begin
  if p_decision not in ('yes','no') then raise exception 'invalid_repeat_decision'; end if;

  select * into v_chain
  from public.activity_repeat_chains
  where id = p_chain_id
  for update;
  if not found then raise exception 'repeat_chain_not_found'; end if;
  if v_chain.organizer_key <> p_actor_user_key then raise exception 'repeat_organizer_mismatch' using errcode = '42501'; end if;

  if v_chain.decision is not null then
    return query select v_chain.next_activity_id, v_chain.repeat_enabled;
    return;
  end if;

  if p_decision = 'no' then
    update public.activity_repeat_chains
    set decision = 'no', decided_at = now(), repeat_enabled = false, updated_at = now()
    where id = v_chain.id;
    return query select null::uuid, false;
    return;
  end if;

  select * into v_source
  from public.activities
  where id = v_chain.source_activity_id
  for share;
  if not found then raise exception 'repeat_source_missing'; end if;
  if v_source.organizer_key <> v_chain.organizer_key then raise exception 'repeat_source_owner_mismatch'; end if;
  if v_source.visibility = 'private' then raise exception 'repeat_source_not_publishable'; end if;

  insert into public.activities (
    category_id, activity_ru, activity_cs, title_ru, title_cs,
    description_ru, description_cs, event_date, event_time, city_id,
    address, location_url, participant_note, activity_type, metadata,
    price, capacity, organizer, organizer_key, visibility, urgent, popular,
    series_id, series_occurrence_no, series_occurrence_status
  ) values (
    v_source.category_id, v_source.activity_ru, v_source.activity_cs, v_source.title_ru, v_source.title_cs,
    v_source.description_ru, v_source.description_cs, v_source.event_date + 7, v_source.event_time, v_source.city_id,
    v_source.address, v_source.location_url, v_source.participant_note, v_source.activity_type, v_source.metadata,
    v_source.price, v_source.capacity, v_source.organizer, v_source.organizer_key, v_source.visibility,
    false, false, null, null, null
  ) returning id into v_created;

  insert into public.activity_members(activity_id, user_key, display_name, status)
  values (v_created, v_source.organizer_key, v_source.organizer, 'joined');

  v_duration_minutes := greatest(1, coalesce((v_source.metadata #>> '{sport,durationMinutes}')::integer, 90));
  insert into public.activity_repeat_chains(
    source_activity_id, organizer_key, create_idempotency_key, repeat_enabled, prompt_due_at
  ) values (
    v_created,
    v_source.organizer_key,
    'repeat:' || v_chain.id::text,
    true,
    (((v_source.event_date + 7)::timestamp + v_source.event_time) at time zone 'Europe/Prague')
      + make_interval(mins => v_duration_minutes)
      + interval '24 hours'
  ) returning id into v_next_chain_id;

  update public.activity_repeat_chains
  set decision = 'yes', decided_at = now(), repeat_enabled = true, next_activity_id = v_created, updated_at = now()
  where id = v_chain.id;

  return query select v_created, true;
end;
$$;

revoke all on function public.go_irl_repeat_activity_decision(uuid, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
