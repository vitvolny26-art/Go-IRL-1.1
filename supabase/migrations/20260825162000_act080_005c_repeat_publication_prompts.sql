-- ACT080-005C / Activ003: Telegram-confirmed repeat publication.
-- Repository-only migration. Do not apply to production without separate approval.

begin;

create table if not exists public.activity_repeat_publication_prompts (
  id uuid primary key default gen_random_uuid(),
  source_activity_id uuid not null unique references public.activities(id) on delete cascade,
  organizer_key text not null,
  due_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'yes', 'no', 'failed', 'expired', 'cancelled')),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 20),
  next_attempt_at timestamptz,
  leased_at timestamptz,
  telegram_message_id bigint,
  decided_at timestamptz,
  next_activity_id uuid references public.activities(id) on delete restrict,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_repeat_prompt_window_check check (expires_at > due_at)
);

create index if not exists activity_repeat_publication_prompts_due_idx
on public.activity_repeat_publication_prompts(coalesce(next_attempt_at, due_at), id)
where status in ('pending', 'failed', 'sending');

create index if not exists activity_repeat_publication_prompts_organizer_idx
on public.activity_repeat_publication_prompts(organizer_key, created_at desc);

alter table public.activity_repeat_publication_prompts enable row level security;
revoke all on table public.activity_repeat_publication_prompts from public, anon, authenticated;

create or replace function go_irl_private.activity_repeat_enabled(p_metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((p_metadata #>> '{repeatPublication,enabled}')::boolean, false);
$$;

revoke all on function go_irl_private.activity_repeat_enabled(jsonb) from public, anon, authenticated;

drop trigger if exists act080_005c_repeat_create_only_guard on public.activities;
create or replace function go_irl_private.enforce_repeat_create_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not go_irl_private.activity_repeat_enabled(old.metadata)
    and go_irl_private.activity_repeat_enabled(new.metadata) then
    raise exception 'repeat_publication_must_be_enabled_at_create';
  end if;
  return new;
end;
$$;
revoke all on function go_irl_private.enforce_repeat_create_only() from public, anon, authenticated;
create trigger act080_005c_repeat_create_only_guard
before update of metadata on public.activities
for each row
execute function go_irl_private.enforce_repeat_create_only();

create or replace function go_irl_private.schedule_repeat_publication_prompt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duration_minutes integer;
  v_event_starts_at timestamptz;
  v_due_at timestamptz;
  v_expires_at timestamptz;
begin
  if not go_irl_private.activity_repeat_enabled(new.metadata) then
    return new;
  end if;

  v_duration_minutes := case
    when new.activity_type = 'sport' then greatest(1, coalesce((new.metadata #>> '{sport,durationMinutes}')::integer, 90))
    else 120
  end;

  v_event_starts_at := make_timestamptz(
    extract(year from new.event_date)::integer,
    extract(month from new.event_date)::integer,
    extract(day from new.event_date)::integer,
    extract(hour from new.event_time)::integer,
    extract(minute from new.event_time)::integer,
    0,
    'Europe/Prague'
  );
  v_due_at := v_event_starts_at + make_interval(mins => v_duration_minutes) + interval '24 hours';
  v_expires_at := v_event_starts_at + interval '7 days';

  if v_due_at >= v_expires_at then
    raise exception 'repeat_publication_prompt_window_invalid';
  end if;

  insert into public.activity_repeat_publication_prompts (
    source_activity_id,
    organizer_key,
    due_at,
    expires_at,
    status,
    attempt_count,
    next_attempt_at,
    leased_at,
    telegram_message_id,
    decided_at,
    next_activity_id,
    last_error_code,
    updated_at
  ) values (
    new.id,
    new.organizer_key,
    v_due_at,
    v_expires_at,
    'pending',
    0,
    null,
    null,
    null,
    null,
    null,
    null,
    now()
  )
  on conflict (source_activity_id) do nothing;

  return new;
end;
$$;

revoke all on function go_irl_private.schedule_repeat_publication_prompt() from public, anon, authenticated;
drop trigger if exists act080_005c_schedule_repeat_prompt on public.activities;
create trigger act080_005c_schedule_repeat_prompt
after insert on public.activities
for each row
execute function go_irl_private.schedule_repeat_publication_prompt();

-- Preserve the released frontend/store RPC surface while changing its semantics:
-- Repeat Create now creates exactly one concrete Activity with repeat opt-in metadata.
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
  v_activity_id uuid;
  v_prompt_id uuid;
  v_idempotency_key text := btrim(coalesce(p_idempotency_key, ''));
  v_repeat_metadata jsonb;
begin
  if v_user_key is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not go_irl_private.has_completed_first_onboarding(v_user_key) then
    raise exception 'first_onboarding_required' using errcode = '42501';
  end if;
  if p_start_date is null or p_event_time is null then raise exception 'repeat_start_required'; end if;
  if p_start_date < (now() at time zone 'Europe/Prague')::date then raise exception 'repeat_start_in_past'; end if;
  if nullif(btrim(p_category_id), '') is null
    or nullif(btrim(p_activity_text), '') is null
    or nullif(btrim(p_title_text), '') is null
    or nullif(btrim(p_city_id), '') is null
    or nullif(btrim(p_address), '') is null
    or nullif(btrim(p_organizer), '') is null then
    raise exception 'repeat_required_text_missing';
  end if;
  if char_length(v_idempotency_key) not between 16 and 160
    or v_idempotency_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'invalid_repeat_idempotency_key';
  end if;
  if p_activity_type not in ('sport','dating','friends','food','travel','culture','local','custom') then
    raise exception 'invalid_activity_type';
  end if;
  if p_visibility not in ('public','private','invite') then raise exception 'invalid_visibility'; end if;
  if p_price < 0 or p_price > 100000 then raise exception 'invalid_price'; end if;
  if p_capacity < 2 or p_capacity > 100 then raise exception 'invalid_capacity'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_key || ':' || v_idempotency_key, 0));

  select prompt.id, prompt.source_activity_id
  into v_prompt_id, v_activity_id
  from public.activity_repeat_publication_prompts prompt
  join public.activities activity on activity.id = prompt.source_activity_id
  where prompt.organizer_key = v_user_key
    and activity.metadata #>> '{repeatPublication,idempotencyKey}' = v_idempotency_key
  limit 1;

  if found then
    return query select v_prompt_id, array[v_activity_id];
    return;
  end if;

  v_repeat_metadata := jsonb_set(
    jsonb_set(coalesce(p_metadata, '{}'::jsonb), '{repeatPublication,enabled}', 'true'::jsonb, true),
    '{repeatPublication,idempotencyKey}', to_jsonb(v_idempotency_key), true
  );

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
  ) values (
    p_category_id,
    p_activity_text,
    p_activity_text,
    p_title_text,
    p_title_text,
    coalesce(p_description_text, ''),
    coalesce(p_description_text, ''),
    p_start_date,
    p_event_time,
    p_city_id,
    p_address,
    nullif(btrim(coalesce(p_location_url, '')), ''),
    nullif(btrim(coalesce(p_participant_note, '')), ''),
    p_activity_type,
    v_repeat_metadata,
    p_price,
    p_capacity,
    p_organizer,
    v_user_key,
    p_visibility,
    false,
    false,
    null,
    null,
    null
  ) returning id into v_activity_id;

  insert into public.activity_members(activity_id, user_key, display_name, status)
  values (v_activity_id, v_user_key, p_organizer, 'joined');

  select id into v_prompt_id
  from public.activity_repeat_publication_prompts
  where source_activity_id = v_activity_id;

  if v_prompt_id is null then raise exception 'repeat_prompt_not_created'; end if;
  return query select v_prompt_id, array[v_activity_id];
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

create or replace function public.go_irl_claim_due_repeat_publication_prompts(
  p_limit integer default 50,
  p_lease_seconds integer default 300
)
returns table(
  prompt_id uuid,
  source_activity_id uuid,
  organizer_key text,
  telegram_user_id text,
  city_id text,
  title text,
  event_date date,
  event_time time
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 200 then raise exception 'invalid_claim_limit'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 1800 then raise exception 'invalid_lease_seconds'; end if;

  return query
  with due as (
    select prompt.id
    from public.activity_repeat_publication_prompts prompt
    join public.activities activity on activity.id = prompt.source_activity_id
    join public.user_provider_identities identity
      on identity.user_key = prompt.organizer_key
     and identity.provider = 'telegram'
     and identity.status = 'active'
     and identity.consented_at is not null
    where (
      prompt.status in ('pending', 'failed')
      and coalesce(prompt.next_attempt_at, prompt.due_at) <= now()
    ) or (
      prompt.status = 'sending'
      and prompt.leased_at <= now() - make_interval(secs => p_lease_seconds)
    )
    and prompt.expires_at > now()
    and activity.organizer_key = prompt.organizer_key
    and activity.visibility <> 'private'
    and go_irl_private.activity_repeat_enabled(activity.metadata)
    order by coalesce(prompt.next_attempt_at, prompt.due_at), prompt.id
    for update of prompt skip locked
    limit p_limit
  ), claimed as (
    update public.activity_repeat_publication_prompts prompt
    set status = 'sending',
        attempt_count = prompt.attempt_count + 1,
        leased_at = now(),
        updated_at = now()
    from due
    where prompt.id = due.id
    returning prompt.*
  )
  select
    claimed.id,
    activity.id,
    claimed.organizer_key,
    identity.provider_user_id,
    activity.city_id,
    coalesce(nullif(activity.title_cs, ''), nullif(activity.title_ru, ''), 'GO IRL event'),
    activity.event_date,
    activity.event_time
  from claimed
  join public.activities activity on activity.id = claimed.source_activity_id
  join public.user_provider_identities identity
    on identity.user_key = claimed.organizer_key
   and identity.provider = 'telegram'
   and identity.status = 'active'
   and identity.consented_at is not null;
end;
$$;

revoke all on function public.go_irl_claim_due_repeat_publication_prompts(integer, integer) from public, anon, authenticated;
grant execute on function public.go_irl_claim_due_repeat_publication_prompts(integer, integer) to service_role;

create or replace function public.go_irl_finish_repeat_publication_prompt(
  p_prompt_id uuid,
  p_outcome text,
  p_telegram_message_id bigint default null,
  p_error_code text default null,
  p_retry_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('sent', 'retry', 'failed', 'expired', 'cancelled') then
    raise exception 'invalid_repeat_prompt_outcome';
  end if;
  if p_outcome = 'retry' and p_retry_at is null then raise exception 'retry_time_required'; end if;

  update public.activity_repeat_publication_prompts
  set status = case when p_outcome = 'retry' then 'failed' else p_outcome end,
      telegram_message_id = case when p_outcome = 'sent' then coalesce(p_telegram_message_id, telegram_message_id) else telegram_message_id end,
      next_attempt_at = case when p_outcome = 'retry' then p_retry_at else null end,
      leased_at = null,
      last_error_code = case when p_outcome in ('retry', 'failed') then left(coalesce(p_error_code, 'unknown'), 80) else null end,
      updated_at = now()
  where id = p_prompt_id and status = 'sending';

  if not found then raise exception 'repeat_prompt_not_claimed'; end if;
end;
$$;

revoke all on function public.go_irl_finish_repeat_publication_prompt(uuid, text, bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.go_irl_finish_repeat_publication_prompt(uuid, text, bigint, text, timestamptz) to service_role;

create or replace function public.go_irl_repeat_publication_decision(
  p_prompt_id uuid,
  p_telegram_user_id text,
  p_decision text
)
returns table(
  created_activity_id uuid,
  duplicate boolean,
  published boolean,
  visibility text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prompt public.activity_repeat_publication_prompts%rowtype;
  v_source public.activities%rowtype;
  v_actor_user_key text;
  v_created uuid;
  v_next_metadata jsonb;
begin
  if p_decision not in ('yes', 'no') then raise exception 'invalid_repeat_decision'; end if;

  select identity.user_key
  into v_actor_user_key
  from public.user_provider_identities identity
  where identity.provider = 'telegram'
    and identity.provider_user_id = p_telegram_user_id
    and identity.status = 'active'
    and identity.consented_at is not null;

  if v_actor_user_key is null then raise exception 'repeat_actor_not_active' using errcode = '42501'; end if;

  select * into v_prompt
  from public.activity_repeat_publication_prompts
  where id = p_prompt_id
  for update;
  if not found then raise exception 'repeat_prompt_not_found'; end if;
  if v_prompt.organizer_key <> v_actor_user_key then raise exception 'repeat_organizer_mismatch' using errcode = '42501'; end if;

  if v_prompt.status in ('yes', 'no') then
    return query select v_prompt.next_activity_id, true, v_prompt.status = 'yes',
      (select activity.visibility from public.activities activity where activity.id = v_prompt.next_activity_id);
    return;
  end if;

  if v_prompt.expires_at <= now() then
    update public.activity_repeat_publication_prompts
    set status = 'expired', leased_at = null, updated_at = now()
    where id = v_prompt.id;
    return query select null::uuid, false, false, null::text;
    return;
  end if;

  if p_decision = 'no' then
    update public.activity_repeat_publication_prompts
    set status = 'no', decided_at = now(), leased_at = null, next_attempt_at = null, updated_at = now()
    where id = v_prompt.id;
    return query select null::uuid, false, false, null::text;
    return;
  end if;

  select * into v_source
  from public.activities
  where id = v_prompt.source_activity_id
  for share;
  if not found then raise exception 'repeat_source_missing'; end if;
  if v_source.organizer_key <> v_prompt.organizer_key then raise exception 'repeat_source_owner_mismatch'; end if;
  if v_source.visibility = 'private' then raise exception 'repeat_source_not_publishable'; end if;
  if not go_irl_private.activity_repeat_enabled(v_source.metadata) then raise exception 'repeat_source_opt_out'; end if;
  if v_source.series_occurrence_status = 'cancelled' then raise exception 'repeat_source_cancelled'; end if;

  v_next_metadata := jsonb_set(
    jsonb_set(coalesce(v_source.metadata, '{}'::jsonb), '{repeatPublication,enabled}', 'true'::jsonb, true),
    '{repeatPublication,sourcePromptId}', to_jsonb(v_prompt.id::text), true
  );

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
  ) values (
    v_source.category_id,
    v_source.activity_ru,
    v_source.activity_cs,
    v_source.title_ru,
    v_source.title_cs,
    v_source.description_ru,
    v_source.description_cs,
    v_source.event_date + 7,
    v_source.event_time,
    v_source.city_id,
    v_source.address,
    v_source.location_url,
    v_source.participant_note,
    v_source.activity_type,
    v_next_metadata,
    v_source.price,
    v_source.capacity,
    v_source.organizer,
    v_source.organizer_key,
    v_source.visibility,
    false,
    false,
    null,
    null,
    null
  ) returning id into v_created;

  insert into public.activity_members(activity_id, user_key, display_name, status)
  values (v_created, v_source.organizer_key, v_source.organizer, 'joined');

  update public.activity_repeat_publication_prompts
  set status = 'yes',
      decided_at = now(),
      next_activity_id = v_created,
      leased_at = null,
      next_attempt_at = null,
      updated_at = now()
  where id = v_prompt.id;

  return query select v_created, false, true, v_source.visibility;
end;
$$;

revoke all on function public.go_irl_repeat_publication_decision(uuid, text, text) from public, anon, authenticated;
grant execute on function public.go_irl_repeat_publication_decision(uuid, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
