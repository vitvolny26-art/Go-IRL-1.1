-- Activ003 / ACT080-005C P1 corrections discovered during PR review.
-- Keeps the original migration immutable and replaces only the affected RPC definitions.

begin;

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

  -- jsonb_set does not create a missing intermediate repeatPublication object.
  -- Merge the complete object at the top level so {} metadata is valid.
  v_repeat_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'repeatPublication',
    coalesce(p_metadata -> 'repeatPublication', '{}'::jsonb) || jsonb_build_object(
      'enabled', true,
      'idempotencyKey', v_idempotency_key
    )
  );

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
    p_activity_type, v_repeat_metadata, p_price, p_capacity, p_organizer, v_user_key,
    p_visibility, false, false, null, null, null
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
      (
        prompt.status in ('pending', 'failed')
        and coalesce(prompt.next_attempt_at, prompt.due_at) <= now()
      ) or (
        prompt.status = 'sending'
        and prompt.leased_at <= now() - make_interval(secs => p_lease_seconds)
      )
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

notify pgrst, 'reload schema';
commit;
