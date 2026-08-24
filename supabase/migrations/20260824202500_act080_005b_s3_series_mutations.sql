-- ACT080-005B-S3: recurring Activity series edit/cancel semantics.
-- Repository migration only. Production apply requires a separate explicit approval.
-- Concrete Activity ids remain stable so membership, reminders, share links and chat bindings stay occurrence-scoped.

begin;

create or replace function public.go_irl_update_activity_series_occurrences(
  p_activity_id uuid,
  p_scope text,
  p_category_id text,
  p_activity_text text,
  p_title_text text,
  p_description_text text,
  p_event_date date,
  p_event_time time,
  p_city_id text,
  p_address text,
  p_location_url text,
  p_participant_note text,
  p_activity_type text,
  p_metadata jsonb,
  p_price integer,
  p_capacity integer,
  p_visibility text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_target public.activities%rowtype;
  v_series public.activity_series%rowtype;
  v_previous_date date;
  v_date_delta integer;
  v_affected_ids uuid[];
  v_first_remaining_date date;
  v_last_remaining_date date;
  v_remaining_count integer;
begin
  if v_user_key is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not go_irl_private.has_completed_first_onboarding(v_user_key) then
    raise exception 'first_onboarding_required' using errcode = '42501';
  end if;

  if p_scope not in ('single', 'following') then
    raise exception 'invalid_series_mutation_scope' using errcode = '22023';
  end if;

  if p_event_date is null or p_event_time is null then
    raise exception 'event_start_required' using errcode = '22023';
  end if;

  if make_timestamptz(
    extract(year from p_event_date)::integer,
    extract(month from p_event_date)::integer,
    extract(day from p_event_date)::integer,
    extract(hour from p_event_time)::integer,
    extract(minute from p_event_time)::integer,
    0,
    'Europe/Prague'
  ) <= now() then
    raise exception 'series_new_start_already_started' using errcode = '22023';
  end if;

  if nullif(btrim(p_category_id), '') is null
    or nullif(btrim(p_activity_text), '') is null
    or nullif(btrim(p_title_text), '') is null
    or nullif(btrim(p_city_id), '') is null
    or nullif(btrim(p_address), '') is null then
    raise exception 'series_required_text_missing' using errcode = '22023';
  end if;

  if p_activity_type not in ('sport', 'dating', 'friends', 'food', 'travel', 'culture', 'local', 'custom') then
    raise exception 'invalid_activity_type' using errcode = '22023';
  end if;

  if p_visibility not in ('public', 'private', 'invite') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;

  if p_price < 0 or p_price > 100000 then
    raise exception 'invalid_price' using errcode = '22023';
  end if;

  if p_capacity < 2 or p_capacity > 100 then
    raise exception 'invalid_capacity' using errcode = '22023';
  end if;

  select activity.*
  into v_target
  from public.activities activity
  where activity.id = p_activity_id
  for update;

  if not found or v_target.organizer_key <> v_user_key then
    raise exception 'series_activity_not_found_or_not_owned' using errcode = '42501';
  end if;

  if v_target.series_id is null
    or v_target.series_occurrence_no is null
    or v_target.series_occurrence_status <> 'scheduled' then
    raise exception 'activity_is_not_editable_series_occurrence' using errcode = '22023';
  end if;

  if make_timestamptz(
    extract(year from v_target.event_date)::integer,
    extract(month from v_target.event_date)::integer,
    extract(day from v_target.event_date)::integer,
    extract(hour from v_target.event_time)::integer,
    extract(minute from v_target.event_time)::integer,
    0,
    'Europe/Prague'
  ) <= now() then
    raise exception 'series_occurrence_already_started' using errcode = '22023';
  end if;

  select series.*
  into v_series
  from public.activity_series series
  where series.id = v_target.series_id
  for update;

  if not found or v_series.organizer_key <> v_user_key then
    raise exception 'series_not_found_or_not_owned' using errcode = '42501';
  end if;

  if p_scope = 'single' then
    update public.activities
    set
      category_id = p_category_id,
      activity_ru = p_activity_text,
      activity_cs = p_activity_text,
      title_ru = p_title_text,
      title_cs = p_title_text,
      description_ru = coalesce(p_description_text, ''),
      description_cs = coalesce(p_description_text, ''),
      event_date = p_event_date,
      event_time = p_event_time,
      city_id = p_city_id,
      address = p_address,
      location_url = nullif(btrim(coalesce(p_location_url, '')), ''),
      participant_note = nullif(btrim(coalesce(p_participant_note, '')), ''),
      activity_type = p_activity_type,
      metadata = coalesce(p_metadata, '{}'::jsonb),
      price = p_price,
      capacity = p_capacity,
      visibility = p_visibility,
      series_id = null,
      series_occurrence_no = null,
      series_occurrence_status = null
    where id = v_target.id;

    select
      min(activity.event_date),
      max(activity.event_date),
      count(*)::integer
    into v_first_remaining_date, v_last_remaining_date, v_remaining_count
    from public.activities activity
    where activity.series_id = v_series.id
      and activity.series_occurrence_status = 'scheduled'
      and make_timestamptz(
        extract(year from activity.event_date)::integer,
        extract(month from activity.event_date)::integer,
        extract(day from activity.event_date)::integer,
        extract(hour from activity.event_time)::integer,
        extract(minute from activity.event_time)::integer,
        0,
        'Europe/Prague'
      ) > now();

    if v_remaining_count = 0 then
      update public.activity_series
      set status = 'cancelled', updated_at = now()
      where id = v_series.id;
    else
      update public.activity_series
      set
        first_event_date = v_first_remaining_date,
        weekday = extract(isodow from v_first_remaining_date)::smallint,
        until_date = case when v_series.until_date is not null then v_last_remaining_date else null end,
        occurrence_count = case when v_series.occurrence_count is not null then v_remaining_count::smallint else null end,
        updated_at = now()
      where id = v_series.id;
    end if;

    update public.activity_chats
    set expires_at = public.go_irl_activity_chat_expires_at(v_target.id), updated_at = now()
    where activity_id = v_target.id and status = 'active';

    update public.activity_external_telegram_chats external_chat
    set
      topic_delete_after = case
        when external_chat.telegram_message_thread_id is null or external_chat.topic_deleted_at is not null
          then external_chat.topic_delete_after
        else (
          select make_timestamptz(
            extract(year from activity.event_date)::integer,
            extract(month from activity.event_date)::integer,
            extract(day from activity.event_date)::integer,
            extract(hour from activity.event_time)::integer,
            extract(minute from activity.event_time)::integer,
            0,
            'Europe/Prague'
          ) + make_interval(mins => case
            when coalesce(activity.metadata->'sport'->>'durationMinutes', '') ~ '^[0-9]+$'
              then greatest((activity.metadata->'sport'->>'durationMinutes')::integer, 1)
            else 90
          end) + interval '24 hours'
          from public.activities activity
          where activity.id = external_chat.activity_id
        )
      end,
      updated_at = now()
    where external_chat.activity_id = v_target.id;

    return v_target.id;
  end if;

  select max(activity.event_date)
  into v_previous_date
  from public.activities activity
  where activity.series_id = v_series.id
    and activity.series_occurrence_status = 'scheduled'
    and activity.series_occurrence_no < v_target.series_occurrence_no;

  if v_previous_date is not null and p_event_date <= v_previous_date then
    raise exception 'series_edit_would_overlap_previous_occurrence' using errcode = '22023';
  end if;

  v_date_delta := p_event_date - v_target.event_date;

  select array_agg(activity.id order by activity.series_occurrence_no)
  into v_affected_ids
  from public.activities activity
  where activity.series_id = v_series.id
    and activity.series_occurrence_status = 'scheduled'
    and activity.series_occurrence_no >= v_target.series_occurrence_no;

  if coalesce(array_length(v_affected_ids, 1), 0) = 0 then
    raise exception 'series_following_occurrences_not_found';
  end if;

  -- Existing activities_reschedule_event_reminders trigger reschedules concrete reminders on date/time changes.
  update public.activities activity
  set
    category_id = p_category_id,
    activity_ru = p_activity_text,
    activity_cs = p_activity_text,
    title_ru = p_title_text,
    title_cs = p_title_text,
    description_ru = coalesce(p_description_text, ''),
    description_cs = coalesce(p_description_text, ''),
    event_date = activity.event_date + v_date_delta,
    event_time = p_event_time,
    city_id = p_city_id,
    address = p_address,
    location_url = nullif(btrim(coalesce(p_location_url, '')), ''),
    participant_note = nullif(btrim(coalesce(p_participant_note, '')), ''),
    activity_type = p_activity_type,
    metadata = coalesce(p_metadata, '{}'::jsonb),
    price = p_price,
    capacity = p_capacity,
    visibility = p_visibility
  where activity.id = any(v_affected_ids);

  select
    min(activity.event_date),
    max(activity.event_date),
    count(*)::integer
  into v_first_remaining_date, v_last_remaining_date, v_remaining_count
  from public.activities activity
  where activity.id = any(v_affected_ids)
    and activity.series_occurrence_status = 'scheduled';

  update public.activity_series
  set
    category_id = p_category_id,
    activity_ru = p_activity_text,
    activity_cs = p_activity_text,
    title_ru = p_title_text,
    title_cs = p_title_text,
    description_ru = coalesce(p_description_text, ''),
    description_cs = coalesce(p_description_text, ''),
    first_event_date = v_first_remaining_date,
    event_time = p_event_time,
    weekday = extract(isodow from v_first_remaining_date)::smallint,
    until_date = case when v_series.until_date is not null then v_last_remaining_date else null end,
    occurrence_count = case when v_series.occurrence_count is not null then v_remaining_count::smallint else null end,
    city_id = p_city_id,
    address = p_address,
    location_url = nullif(btrim(coalesce(p_location_url, '')), ''),
    participant_note = nullif(btrim(coalesce(p_participant_note, '')), ''),
    activity_type = p_activity_type,
    metadata = coalesce(p_metadata, '{}'::jsonb),
    price = p_price,
    capacity = p_capacity,
    visibility = p_visibility,
    status = 'active',
    updated_at = now()
  where id = v_series.id;

  update public.activity_chats chat
  set expires_at = public.go_irl_activity_chat_expires_at(chat.activity_id), updated_at = now()
  where chat.activity_id = any(v_affected_ids)
    and chat.status = 'active';

  update public.activity_external_telegram_chats external_chat
  set
    topic_delete_after = case
      when external_chat.telegram_message_thread_id is null or external_chat.topic_deleted_at is not null
        then external_chat.topic_delete_after
      else (
        select make_timestamptz(
          extract(year from activity.event_date)::integer,
          extract(month from activity.event_date)::integer,
          extract(day from activity.event_date)::integer,
          extract(hour from activity.event_time)::integer,
          extract(minute from activity.event_time)::integer,
          0,
          'Europe/Prague'
        ) + make_interval(mins => case
          when coalesce(activity.metadata->'sport'->>'durationMinutes', '') ~ '^[0-9]+$'
            then greatest((activity.metadata->'sport'->>'durationMinutes')::integer, 1)
          else 90
        end) + interval '24 hours'
        from public.activities activity
        where activity.id = external_chat.activity_id
      )
    end,
    updated_at = now()
  where external_chat.activity_id = any(v_affected_ids);

  return v_target.id;
end;
$$;

revoke all on function public.go_irl_update_activity_series_occurrences(
  uuid, text, text, text, text, text, date, time, text, text, text, text,
  text, jsonb, integer, integer, text
) from public, anon;
grant execute on function public.go_irl_update_activity_series_occurrences(
  uuid, text, text, text, text, text, date, time, text, text, text, text,
  text, jsonb, integer, integer, text
) to authenticated;

create or replace function public.go_irl_cancel_activity_series_occurrences(
  p_activity_id uuid,
  p_scope text
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_target public.activities%rowtype;
  v_series public.activity_series%rowtype;
  v_affected_ids uuid[];
  v_first_remaining_date date;
  v_last_remaining_date date;
  v_remaining_count integer;
begin
  if v_user_key is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not go_irl_private.has_completed_first_onboarding(v_user_key) then
    raise exception 'first_onboarding_required' using errcode = '42501';
  end if;

  if p_scope not in ('single', 'following') then
    raise exception 'invalid_series_mutation_scope' using errcode = '22023';
  end if;

  select activity.*
  into v_target
  from public.activities activity
  where activity.id = p_activity_id
  for update;

  if not found or v_target.organizer_key <> v_user_key then
    raise exception 'series_activity_not_found_or_not_owned' using errcode = '42501';
  end if;

  if v_target.series_id is null
    or v_target.series_occurrence_no is null
    or v_target.series_occurrence_status <> 'scheduled' then
    raise exception 'activity_is_not_cancellable_series_occurrence' using errcode = '22023';
  end if;

  if make_timestamptz(
    extract(year from v_target.event_date)::integer,
    extract(month from v_target.event_date)::integer,
    extract(day from v_target.event_date)::integer,
    extract(hour from v_target.event_time)::integer,
    extract(minute from v_target.event_time)::integer,
    0,
    'Europe/Prague'
  ) <= now() then
    raise exception 'series_occurrence_already_started' using errcode = '22023';
  end if;

  select series.*
  into v_series
  from public.activity_series series
  where series.id = v_target.series_id
  for update;

  if not found or v_series.organizer_key <> v_user_key then
    raise exception 'series_not_found_or_not_owned' using errcode = '42501';
  end if;

  select array_agg(activity.id order by activity.series_occurrence_no)
  into v_affected_ids
  from public.activities activity
  where activity.series_id = v_series.id
    and activity.series_occurrence_status = 'scheduled'
    and (
      (p_scope = 'single' and activity.id = v_target.id)
      or (p_scope = 'following' and activity.series_occurrence_no >= v_target.series_occurrence_no)
    );

  if coalesce(array_length(v_affected_ids, 1), 0) = 0 then
    raise exception 'series_occurrences_not_found';
  end if;

  insert into public.event_notifications (
    user_key,
    activity_id,
    kind,
    payload,
    delivery_key
  )
  select
    member.user_key,
    activity.id,
    'event_cancelled',
    public.go_irl_event_snapshot(activity),
    'activity:' || activity.id::text || ':' || member.user_key
      || ':event_cancelled:series:' || txid_current()::text
  from public.activities activity
  join public.activity_members member on member.activity_id = activity.id
  where activity.id = any(v_affected_ids)
    and member.status in ('joined', 'waiting', 'pending')
  on conflict (delivery_key) do nothing;

  update public.event_reminders reminder
  set
    status = 'cancelled',
    next_attempt_at = null,
    leased_at = null,
    last_error_code = null,
    updated_at = now()
  where reminder.activity_id = any(v_affected_ids)
    and reminder.status in ('scheduled', 'sending', 'failed');

  update public.activity_chats chat
  set status = 'archived', updated_at = now()
  where chat.activity_id = any(v_affected_ids)
    and chat.status in ('active', 'expired');

  update public.activity_telegram_chat_bindings binding
  set expires_at = least(binding.expires_at, now())
  where binding.activity_id = any(v_affected_ids)
    and binding.consumed_at is null;

  update public.activity_external_telegram_chats external_chat
  set topic_delete_after = least(coalesce(external_chat.topic_delete_after, now()), now()), updated_at = now()
  where external_chat.activity_id = any(v_affected_ids)
    and external_chat.telegram_message_thread_id is not null
    and external_chat.topic_deleted_at is null
    and external_chat.keep_archive = false;

  -- Existing activities_reschedule_event_reminders trigger reschedules concrete reminders on date/time changes.
  update public.activities activity
  set
    series_occurrence_status = 'cancelled',
    visibility = 'private'
  where activity.id = any(v_affected_ids);

  select
    min(activity.event_date),
    max(activity.event_date),
    count(*)::integer
  into v_first_remaining_date, v_last_remaining_date, v_remaining_count
  from public.activities activity
  where activity.series_id = v_series.id
    and activity.series_occurrence_status = 'scheduled'
      and make_timestamptz(
        extract(year from activity.event_date)::integer,
        extract(month from activity.event_date)::integer,
        extract(day from activity.event_date)::integer,
        extract(hour from activity.event_time)::integer,
        extract(minute from activity.event_time)::integer,
        0,
        'Europe/Prague'
      ) > now();

  if v_remaining_count = 0 then
    update public.activity_series
    set status = 'cancelled', updated_at = now()
    where id = v_series.id;
  else
    update public.activity_series
    set
      first_event_date = v_first_remaining_date,
      weekday = extract(isodow from v_first_remaining_date)::smallint,
      until_date = case when v_series.until_date is not null then v_last_remaining_date else null end,
      occurrence_count = case when v_series.occurrence_count is not null then v_remaining_count::smallint else null end,
      status = 'active',
      updated_at = now()
    where id = v_series.id;
  end if;

  return v_affected_ids;
end;
$$;

revoke all on function public.go_irl_cancel_activity_series_occurrences(uuid, text)
from public, anon;
grant execute on function public.go_irl_cancel_activity_series_occurrences(uuid, text)
to authenticated;

notify pgrst, 'reload schema';

commit;
