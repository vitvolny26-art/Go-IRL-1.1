-- POSTEVENT001 D1: Activity post-event trust foundation.
-- Repository preparation only. Do not apply to production without a separate approval gate.
-- Baseline inspected: GitHub main a75b5678ae600da12866beb11373937fd7fb353a.

begin;

create table if not exists public.activity_post_event_outcomes (
  activity_id uuid primary key,
  organizer_user_key text not null references public.app_users(user_key) on delete cascade,
  city_id text not null,
  event_timezone text not null check (btrim(event_timezone) <> ''),
  event_date date not null,
  event_time time not null,
  event_starts_at timestamptz not null,
  event_ends_at timestamptz not null,
  organizer_prompt_at timestamptz not null,
  organizer_reminder_at timestamptz not null,
  participant_fallback_at timestamptz not null,
  organizer_event_claim text null
    check (organizer_event_claim in ('happened','did_not_happen','problem')),
  event_resolution text not null default 'pending'
    check (event_resolution in ('pending','confirmed_happened','confirmed_not_happened','disputed','voided')),
  organizer_responded_at timestamptz null,
  organizer_roster_finalized_at timestamptz null,
  source_activity_deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_post_event_outcomes_event_window_check
    check (event_ends_at > event_starts_at),
  constraint activity_post_event_outcomes_prompt_order_check
    check (
      organizer_prompt_at < organizer_reminder_at
      and organizer_reminder_at < participant_fallback_at
    )
);

create table if not exists public.activity_attendance_feedback (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activity_post_event_outcomes(activity_id) on delete cascade,
  participant_user_key text not null references public.app_users(user_key) on delete cascade,
  participant_display_name text not null,
  organizer_user_key text not null references public.app_users(user_key) on delete cascade,
  eligibility_state text not null
    check (eligibility_state in ('eligible','withdrawn_before_start','ineligible_late_join','voided')),
  eligible_at timestamptz null,
  membership_removed_at timestamptz null,
  organizer_draft_absent boolean not null default false,
  organizer_claim text null check (organizer_claim in ('attended','absent')),
  organizer_claimed_at timestamptz null,
  participant_claim text null
    check (participant_claim in ('attended','absent','event_did_not_happen')),
  participant_claimed_at timestamptz null,
  resolution text not null default 'pending'
    check (resolution in ('pending','attended','absent','disputed','voided')),
  resolved_at timestamptz null,
  organizer_rating smallint null check (organizer_rating between 1 and 5),
  rating_tags text[] null,
  rating_first_submitted_at timestamptz null,
  rating_updated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_attendance_feedback_unique_participant unique (activity_id, participant_user_key),
  constraint activity_attendance_feedback_eligible_timestamp_check
    check (eligibility_state <> 'eligible' or eligible_at is not null),
  constraint activity_attendance_feedback_rating_resolution_check
    check (organizer_rating is null or resolution = 'attended'),
  constraint activity_attendance_feedback_rating_tags_check
    check (
      rating_tags is null
      or (
        organizer_rating is not null
        and rating_tags <@ array['organization','communication','punctuality','safety','other']::text[]
      )
    ),
  constraint activity_attendance_feedback_rating_timestamp_check
    check (
      (organizer_rating is null and rating_first_submitted_at is null and rating_updated_at is null)
      or (organizer_rating is not null and rating_first_submitted_at is not null and rating_updated_at is not null)
    )
);

create index if not exists activity_post_event_outcomes_organizer_idx
on public.activity_post_event_outcomes(organizer_user_key, event_starts_at desc);

create index if not exists activity_post_event_outcomes_resolution_idx
on public.activity_post_event_outcomes(event_resolution, participant_fallback_at);

create index if not exists activity_attendance_feedback_participant_idx
on public.activity_attendance_feedback(participant_user_key, created_at desc);

create index if not exists activity_attendance_feedback_activity_resolution_idx
on public.activity_attendance_feedback(activity_id, resolution, eligibility_state);

create index if not exists activity_attendance_feedback_organizer_idx
on public.activity_attendance_feedback(organizer_user_key, activity_id);

alter table public.activity_post_event_outcomes enable row level security;
alter table public.activity_attendance_feedback enable row level security;

revoke all on table public.activity_post_event_outcomes from public, anon;
revoke all on table public.activity_attendance_feedback from public, anon;
revoke insert, update, delete on table public.activity_post_event_outcomes from authenticated;
revoke insert, update, delete on table public.activity_attendance_feedback from authenticated;
grant select on table public.activity_post_event_outcomes to authenticated;
grant select on table public.activity_attendance_feedback to authenticated;

create or replace function go_irl_private.postevent_activity_timezone(p_city_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_city_id, '')))
    when 'olomouc' then 'Europe/Prague'
    when 'prerov' then 'Europe/Prague'
    when 'praha' then 'Europe/Prague'
    when 'brno' then 'Europe/Prague'
    when 'bratislava' then 'Europe/Bratislava'
    when 'krakow' then 'Europe/Warsaw'
    when 'kyiv' then 'Europe/Kyiv'
    when 'kharkiv' then 'Europe/Kyiv'
    when 'odesa' then 'Europe/Kyiv'
    when 'lviv' then 'Europe/Kyiv'
    else null
  end;
$$;

create or replace function go_irl_private.postevent_activity_duration_minutes(
  p_activity_type text,
  p_metadata jsonb
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_activity_type = 'sport'
      and coalesce(p_metadata #>> '{sport,durationMinutes}', '') ~ '^[0-9]+$'
      then greatest(1, (p_metadata #>> '{sport,durationMinutes}')::integer)
    when p_activity_type = 'sport' then 90
    else 120
  end;
$$;

create or replace function go_irl_private.postevent_activity_starts_at(
  p_event_date date,
  p_event_time time,
  p_city_id text
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_timezone text := go_irl_private.postevent_activity_timezone(p_city_id);
begin
  if p_event_date is null or p_event_time is null or v_timezone is null then
    return null;
  end if;

  return make_timestamptz(
    extract(year from p_event_date)::integer,
    extract(month from p_event_date)::integer,
    extract(day from p_event_date)::integer,
    extract(hour from p_event_time)::integer,
    extract(minute from p_event_time)::integer,
    extract(second from p_event_time),
    v_timezone
  );
end;
$$;

create or replace function go_irl_private.postevent_local_day_time(
  p_event_date date,
  p_days_after integer,
  p_hour integer,
  p_city_id text
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_date date := p_event_date + p_days_after;
  v_timezone text := go_irl_private.postevent_activity_timezone(p_city_id);
begin
  if v_date is null or v_timezone is null or p_hour not between 0 and 23 then
    return null;
  end if;

  return make_timestamptz(
    extract(year from v_date)::integer,
    extract(month from v_date)::integer,
    extract(day from v_date)::integer,
    p_hour,
    0,
    0,
    v_timezone
  );
end;
$$;

create or replace function go_irl_private.postevent_attendance_resolution(
  p_organizer_claim text,
  p_participant_claim text,
  p_eligibility_state text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_eligibility_state <> 'eligible' then 'voided'
    when p_organizer_claim is null or p_participant_claim is null then 'pending'
    when p_participant_claim = 'event_did_not_happen' then 'disputed'
    when p_organizer_claim = 'attended' and p_participant_claim = 'attended' then 'attended'
    when p_organizer_claim = 'absent' and p_participant_claim = 'absent' then 'absent'
    else 'disputed'
  end;
$$;

create or replace function go_irl_private.postevent_write_audit(
  p_actor_user_key text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    coalesce(nullif(btrim(p_actor_user_key), ''), 'system'),
    p_action,
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function go_irl_private.postevent_recompute_event_resolution(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_resolution text := 'pending';
begin
  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found or v_outcome.event_resolution in ('voided','confirmed_not_happened') then
    return;
  end if;

  if v_outcome.organizer_event_claim = 'problem' then
    v_resolution := 'disputed';
  elsif v_outcome.organizer_event_claim = 'happened'
    and exists (
      select 1
      from public.activity_attendance_feedback feedback
      where feedback.activity_id = p_activity_id
        and feedback.eligibility_state = 'eligible'
        and feedback.participant_claim = 'event_did_not_happen'
    ) then
    v_resolution := 'disputed';
  elsif v_outcome.organizer_event_claim = 'did_not_happen'
    and exists (
      select 1
      from public.activity_attendance_feedback feedback
      where feedback.activity_id = p_activity_id
        and feedback.eligibility_state = 'eligible'
        and feedback.participant_claim = 'attended'
    ) then
    v_resolution := 'disputed';
  elsif v_outcome.organizer_event_claim = 'happened'
    and v_outcome.organizer_roster_finalized_at is not null
    and exists (
      select 1
      from public.activity_attendance_feedback feedback
      where feedback.activity_id = p_activity_id
        and feedback.eligibility_state = 'eligible'
        and feedback.resolution = 'attended'
    ) then
    v_resolution := 'confirmed_happened';
  end if;

  update public.activity_post_event_outcomes
  set event_resolution = v_resolution,
      updated_at = now()
  where activity_id = p_activity_id;
end;
$$;

create or replace function go_irl_private.postevent_resync_future_candidates(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome public.activity_post_event_outcomes%rowtype;
begin
  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found
     or v_outcome.event_resolution = 'voided'
     or v_outcome.event_starts_at <= now()
     or v_outcome.organizer_responded_at is not null then
    return;
  end if;

  insert into public.activity_attendance_feedback(
    activity_id,
    participant_user_key,
    participant_display_name,
    organizer_user_key,
    eligibility_state,
    eligible_at,
    membership_removed_at,
    resolution,
    updated_at
  )
  select
    member.activity_id,
    member.user_key,
    member.display_name,
    v_outcome.organizer_user_key,
    'eligible',
    now(),
    null,
    'pending',
    now()
  from public.activity_members member
  join public.app_users participant_user on participant_user.user_key = member.user_key
  where member.activity_id = p_activity_id
    and member.status = 'joined'
    and member.user_key <> v_outcome.organizer_user_key
    and participant_user.status = 'active'
  on conflict (activity_id, participant_user_key) do update
  set participant_display_name = excluded.participant_display_name,
      organizer_user_key = excluded.organizer_user_key,
      eligibility_state = 'eligible',
      eligible_at = coalesce(public.activity_attendance_feedback.eligible_at, excluded.eligible_at),
      membership_removed_at = null,
      resolution = case
        when public.activity_attendance_feedback.organizer_claim is null
          and public.activity_attendance_feedback.participant_claim is null
          and public.activity_attendance_feedback.organizer_rating is null
          then 'pending'
        else public.activity_attendance_feedback.resolution
      end,
      updated_at = now()
  where public.activity_attendance_feedback.organizer_claim is null
    and public.activity_attendance_feedback.participant_claim is null
    and public.activity_attendance_feedback.organizer_rating is null;

  update public.activity_attendance_feedback feedback
  set eligibility_state = case
        when feedback.participant_user_key = v_outcome.organizer_user_key then 'voided'
        else 'withdrawn_before_start'
      end,
      organizer_user_key = v_outcome.organizer_user_key,
      organizer_draft_absent = false,
      resolution = 'voided',
      resolved_at = now(),
      membership_removed_at = case
        when feedback.participant_user_key = v_outcome.organizer_user_key then feedback.membership_removed_at
        else coalesce(feedback.membership_removed_at, now())
      end,
      updated_at = now()
  where feedback.activity_id = p_activity_id
    and feedback.organizer_claim is null
    and feedback.participant_claim is null
    and feedback.organizer_rating is null
    and (
      feedback.participant_user_key = v_outcome.organizer_user_key
      or not exists (
        select 1
        from public.activity_members member
        where member.activity_id = p_activity_id
          and member.user_key = feedback.participant_user_key
          and member.status = 'joined'
      )
    );
end;
$$;

create or replace function go_irl_private.postevent_sync_activity_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_event_starts_at timestamptz;
  v_event_ends_at timestamptz;
  v_prompt_at timestamptz;
  v_reminder_at timestamptz;
  v_fallback_at timestamptz;
  v_duration_minutes integer;
  v_existing public.activity_post_event_outcomes%rowtype;
begin
  v_timezone := go_irl_private.postevent_activity_timezone(new.city_id);
  if v_timezone is null then
    return new;
  end if;

  v_event_starts_at := go_irl_private.postevent_activity_starts_at(new.event_date, new.event_time, new.city_id);
  if v_event_starts_at is null then
    return new;
  end if;

  v_duration_minutes := go_irl_private.postevent_activity_duration_minutes(new.activity_type, new.metadata);
  v_event_ends_at := v_event_starts_at + make_interval(mins => v_duration_minutes);
  v_prompt_at := go_irl_private.postevent_local_day_time(new.event_date, 1, 10, new.city_id);
  v_reminder_at := go_irl_private.postevent_local_day_time(new.event_date, 1, 12, new.city_id);
  v_fallback_at := go_irl_private.postevent_local_day_time(new.event_date, 1, 14, new.city_id);

  select * into v_existing
  from public.activity_post_event_outcomes
  where activity_id = new.id
  for update;

  if not found then
    insert into public.activity_post_event_outcomes(
      activity_id,
      organizer_user_key,
      city_id,
      event_timezone,
      event_date,
      event_time,
      event_starts_at,
      event_ends_at,
      organizer_prompt_at,
      organizer_reminder_at,
      participant_fallback_at,
      event_resolution,
      updated_at
    ) values (
      new.id,
      new.organizer_key,
      new.city_id,
      v_timezone,
      new.event_date,
      new.event_time,
      v_event_starts_at,
      v_event_ends_at,
      v_prompt_at,
      v_reminder_at,
      v_fallback_at,
      case when new.series_occurrence_status = 'cancelled' then 'voided' else 'pending' end,
      now()
    );
  elsif v_existing.event_starts_at > now()
    and v_existing.organizer_responded_at is null
    and not exists (
      select 1
      from public.activity_attendance_feedback feedback
      where feedback.activity_id = new.id
        and (
          feedback.organizer_claim is not null
          or feedback.participant_claim is not null
          or feedback.organizer_rating is not null
        )
    ) then
    update public.activity_post_event_outcomes
    set organizer_user_key = new.organizer_key,
        city_id = new.city_id,
        event_timezone = v_timezone,
        event_date = new.event_date,
        event_time = new.event_time,
        event_starts_at = v_event_starts_at,
        event_ends_at = v_event_ends_at,
        organizer_prompt_at = v_prompt_at,
        organizer_reminder_at = v_reminder_at,
        participant_fallback_at = v_fallback_at,
        event_resolution = case
          when new.series_occurrence_status = 'cancelled' then 'voided'
          else 'pending'
        end,
        updated_at = now()
    where activity_id = new.id;
  end if;

  if new.series_occurrence_status = 'cancelled'
     and v_event_starts_at > now() then
    update public.activity_post_event_outcomes
    set event_resolution = 'voided',
        updated_at = now()
    where activity_id = new.id
      and organizer_responded_at is null;

    update public.activity_attendance_feedback
    set eligibility_state = 'voided',
        organizer_draft_absent = false,
        resolution = 'voided',
        resolved_at = now(),
        organizer_rating = null,
        rating_tags = null,
        rating_first_submitted_at = null,
        rating_updated_at = null,
        updated_at = now()
    where activity_id = new.id
      and organizer_claim is null
      and participant_claim is null;

    return new;
  end if;

  perform go_irl_private.postevent_resync_future_candidates(new.id);
  return new;
end;
$$;

create or replace function go_irl_private.postevent_activity_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome public.activity_post_event_outcomes%rowtype;
begin
  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = old.id
  for update;

  if not found then
    return old;
  end if;

  if v_outcome.event_starts_at > now() then
    update public.activity_post_event_outcomes
    set event_resolution = 'voided',
        source_activity_deleted_at = now(),
        updated_at = now()
    where activity_id = old.id;

    update public.activity_attendance_feedback
    set eligibility_state = 'voided',
        organizer_draft_absent = false,
        resolution = 'voided',
        resolved_at = now(),
        organizer_rating = null,
        rating_tags = null,
        rating_first_submitted_at = null,
        rating_updated_at = null,
        updated_at = now()
    where activity_id = old.id;
  else
    update public.activity_post_event_outcomes
    set source_activity_deleted_at = now(),
        updated_at = now()
    where activity_id = old.id;
  end if;

  return old;
end;
$$;

create or replace function go_irl_private.postevent_activity_member_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activity_id uuid;
  v_user_key text;
  v_display_name text;
  v_new_status text;
  v_old_status text;
  v_outcome public.activity_post_event_outcomes%rowtype;
begin
  if tg_op = 'DELETE' then
    v_activity_id := old.activity_id;
    v_user_key := old.user_key;
    v_display_name := old.display_name;
    v_new_status := null;
    v_old_status := old.status;
  elsif tg_op = 'INSERT' then
    v_activity_id := new.activity_id;
    v_user_key := new.user_key;
    v_display_name := new.display_name;
    v_new_status := new.status;
    v_old_status := null;
  else
    v_activity_id := new.activity_id;
    v_user_key := new.user_key;
    v_display_name := new.display_name;
    v_new_status := new.status;
    v_old_status := old.status;
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = v_activity_id;

  if not found or v_outcome.event_resolution = 'voided' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op <> 'DELETE' and not exists (
    select 1
    from public.app_users app_user
    where app_user.user_key = v_user_key
      and app_user.status = 'active'
  ) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if v_user_key = v_outcome.organizer_user_key then
    if v_outcome.event_starts_at > now() then
      update public.activity_attendance_feedback
      set eligibility_state = 'voided',
          organizer_draft_absent = false,
          resolution = 'voided',
          resolved_at = now(),
          organizer_rating = null,
          rating_tags = null,
          rating_first_submitted_at = null,
          rating_updated_at = null,
          updated_at = now()
      where activity_id = v_activity_id
        and participant_user_key = v_user_key
        and organizer_claim is null
        and participant_claim is null;
    end if;
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op <> 'DELETE' and v_new_status = 'joined' then
    if v_outcome.event_starts_at >= now() then
      insert into public.activity_attendance_feedback(
        activity_id,
        participant_user_key,
        participant_display_name,
        organizer_user_key,
        eligibility_state,
        eligible_at,
        membership_removed_at,
        resolution,
        updated_at
      ) values (
        v_activity_id,
        v_user_key,
        v_display_name,
        v_outcome.organizer_user_key,
        'eligible',
        now(),
        null,
        'pending',
        now()
      )
      on conflict (activity_id, participant_user_key) do update
      set participant_display_name = excluded.participant_display_name,
          organizer_user_key = excluded.organizer_user_key,
          eligibility_state = 'eligible',
          eligible_at = coalesce(public.activity_attendance_feedback.eligible_at, excluded.eligible_at),
          membership_removed_at = null,
          resolution = case
            when public.activity_attendance_feedback.organizer_claim is null
              and public.activity_attendance_feedback.participant_claim is null
              and public.activity_attendance_feedback.organizer_rating is null
              then 'pending'
            else public.activity_attendance_feedback.resolution
          end,
          updated_at = now()
      where public.activity_attendance_feedback.organizer_claim is null
        and public.activity_attendance_feedback.participant_claim is null
        and public.activity_attendance_feedback.organizer_rating is null;
    else
      insert into public.activity_attendance_feedback(
        activity_id,
        participant_user_key,
        participant_display_name,
        organizer_user_key,
        eligibility_state,
        eligible_at,
        resolution,
        updated_at
      ) values (
        v_activity_id,
        v_user_key,
        v_display_name,
        v_outcome.organizer_user_key,
        'ineligible_late_join',
        null,
        'voided',
        now()
      )
      on conflict (activity_id, participant_user_key) do update
      set participant_display_name = case
            when public.activity_attendance_feedback.eligibility_state = 'eligible'
              then public.activity_attendance_feedback.participant_display_name
            else excluded.participant_display_name
          end,
          organizer_user_key = excluded.organizer_user_key,
          eligibility_state = case
            when public.activity_attendance_feedback.eligibility_state = 'eligible'
              then 'eligible'
            else 'ineligible_late_join'
          end,
          resolution = case
            when public.activity_attendance_feedback.eligibility_state = 'eligible'
              then public.activity_attendance_feedback.resolution
            else 'voided'
          end,
          updated_at = now();
    end if;

    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if (tg_op = 'DELETE' and v_old_status = 'joined')
     or (tg_op = 'UPDATE' and v_old_status = 'joined' and v_new_status <> 'joined') then
    if v_outcome.event_starts_at > now() then
      update public.activity_attendance_feedback
      set eligibility_state = 'withdrawn_before_start',
          membership_removed_at = now(),
          organizer_draft_absent = false,
          resolution = 'voided',
          resolved_at = now(),
          organizer_rating = null,
          rating_tags = null,
          rating_first_submitted_at = null,
          rating_updated_at = null,
          updated_at = now()
      where activity_id = v_activity_id
        and participant_user_key = v_user_key
        and organizer_claim is null
        and participant_claim is null;
    else
      update public.activity_attendance_feedback
      set membership_removed_at = coalesce(membership_removed_at, now()),
          updated_at = now()
      where activity_id = v_activity_id
        and participant_user_key = v_user_key
        and eligibility_state = 'eligible';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function go_irl_private.postevent_protect_app_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('go_irl.self_delete_user_key', true) = old.user_key then
    return old;
  end if;

  if exists (
      select 1 from public.activity_post_event_outcomes outcome
      where outcome.organizer_user_key = old.user_key
    )
    or exists (
      select 1 from public.activity_attendance_feedback feedback
      where feedback.participant_user_key = old.user_key
         or feedback.organizer_user_key = old.user_key
    ) then
    raise exception 'post_event_trust_state_requires_governed_identity_cleanup' using errcode = '55000';
  end if;

  return old;
end;
$$;

revoke all on function go_irl_private.postevent_activity_timezone(text) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_activity_duration_minutes(text,jsonb) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_activity_starts_at(date,time,text) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_local_day_time(date,integer,integer,text) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_attendance_resolution(text,text,text) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_write_audit(text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_recompute_event_resolution(uuid) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_resync_future_candidates(uuid) from public, anon, authenticated;
revoke all on function go_irl_private.postevent_sync_activity_snapshot() from public, anon, authenticated;
revoke all on function go_irl_private.postevent_activity_delete_guard() from public, anon, authenticated;
revoke all on function go_irl_private.postevent_activity_member_snapshot() from public, anon, authenticated;
revoke all on function go_irl_private.postevent_protect_app_user_delete() from public, anon, authenticated;

-- Direct table reads are intentionally asymmetric: organizer outcome yes, organizer feedback no.
drop policy if exists activity_post_event_outcomes_participant_select on public.activity_post_event_outcomes;
create policy activity_post_event_outcomes_participant_select
on public.activity_post_event_outcomes
for select
to authenticated
using (
  organizer_user_key = public.go_irl_auth_user_key()
  or exists (
    select 1
    from public.activity_attendance_feedback feedback
    where feedback.activity_id = activity_post_event_outcomes.activity_id
      and feedback.participant_user_key = public.go_irl_auth_user_key()
      and feedback.eligibility_state = 'eligible'
  )
);

drop policy if exists activity_attendance_feedback_participant_select on public.activity_attendance_feedback;
create policy activity_attendance_feedback_participant_select
on public.activity_attendance_feedback
for select
to authenticated
using (participant_user_key = public.go_irl_auth_user_key());

-- Keep snapshots current before the event starts; freeze trust subject/time after start.
drop trigger if exists postevent001_activity_snapshot on public.activities;
create trigger postevent001_activity_snapshot
after insert or update of event_date, event_time, city_id, activity_type, metadata, organizer_key, series_occurrence_status
on public.activities
for each row
execute function go_irl_private.postevent_sync_activity_snapshot();

drop trigger if exists postevent001_activity_delete_guard on public.activities;
create trigger postevent001_activity_delete_guard
before delete on public.activities
for each row
execute function go_irl_private.postevent_activity_delete_guard();

drop trigger if exists postevent001_activity_member_snapshot on public.activity_members;
create trigger postevent001_activity_member_snapshot
after insert or update or delete on public.activity_members
for each row
execute function go_irl_private.postevent_activity_member_snapshot();

drop trigger if exists postevent001_protect_app_user_delete on public.app_users;
create trigger postevent001_protect_app_user_delete
before delete on public.app_users
for each row
execute function go_irl_private.postevent_protect_app_user_delete();

create or replace function public.go_irl_record_activity_post_event_outcome(
  p_activity_id uuid,
  p_claim text
)
returns public.activity_post_event_outcomes
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_outcome public.activity_post_event_outcomes%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;
  if p_claim not in ('happened','did_not_happen','problem') then
    raise exception 'invalid post-event outcome claim' using errcode = '22023';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.event_resolution = 'voided' then
    raise exception 'post-event outcome is voided' using errcode = '22023';
  end if;
  if now() < v_outcome.event_ends_at then
    raise exception 'activity has not finished' using errcode = '22023';
  end if;
  if v_outcome.organizer_roster_finalized_at is not null
     and p_claim <> v_outcome.organizer_event_claim then
    raise exception 'organizer outcome locked after roster finalization' using errcode = '55000';
  end if;

  update public.activity_post_event_outcomes
  set organizer_event_claim = p_claim,
      organizer_responded_at = coalesce(organizer_responded_at, now()),
      event_resolution = case when p_claim = 'problem' then 'disputed' else 'pending' end,
      updated_at = now()
  where activity_id = p_activity_id
  returning * into v_outcome;

  perform go_irl_private.postevent_recompute_event_resolution(p_activity_id);

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.organizer_outcome',
    'activity_post_event_outcome',
    p_activity_id::text,
    jsonb_build_object('claim', p_claim)
  );

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id;

  return v_outcome;
end;
$$;

create or replace function public.go_irl_toggle_activity_post_event_absence(
  p_feedback_id uuid,
  p_absent boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_feedback public.activity_attendance_feedback%rowtype;
  v_outcome public.activity_post_event_outcomes%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id
  for update;

  if not found then raise exception 'feedback candidate not found' using errcode = 'P0002'; end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = v_feedback.activity_id
  for update;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.organizer_event_claim <> 'happened' then
    raise exception 'happened outcome required before attendance roster' using errcode = '22023';
  end if;
  if v_outcome.organizer_roster_finalized_at is not null then
    raise exception 'attendance roster already finalized' using errcode = '55000';
  end if;
  if v_feedback.eligibility_state <> 'eligible' then
    raise exception 'participant is not attendance eligible' using errcode = '22023';
  end if;

  update public.activity_attendance_feedback
  set organizer_draft_absent = p_absent,
      updated_at = now()
  where id = p_feedback_id;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.organizer_draft_absence',
    'activity_attendance_feedback',
    p_feedback_id::text,
    jsonb_build_object('absent', p_absent)
  );
end;
$$;

create or replace function public.go_irl_finalize_activity_post_event_attendance(p_activity_id uuid)
returns public.activity_post_event_outcomes
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_outcome public.activity_post_event_outcomes%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id
  for update;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;
  if v_outcome.organizer_event_claim <> 'happened' then
    raise exception 'happened outcome required before attendance finalization' using errcode = '22023';
  end if;
  if v_outcome.organizer_roster_finalized_at is not null then
    return v_outcome;
  end if;

  perform 1
  from public.activity_attendance_feedback
  where activity_id = p_activity_id
    and eligibility_state = 'eligible'
  for update;

  update public.activity_attendance_feedback feedback
  set organizer_claim = case when feedback.organizer_draft_absent then 'absent' else 'attended' end,
      organizer_draft_absent = false,
      organizer_claimed_at = now(),
      resolution = go_irl_private.postevent_attendance_resolution(
        case when feedback.organizer_draft_absent then 'absent' else 'attended' end,
        feedback.participant_claim,
        feedback.eligibility_state
      ),
      resolved_at = case
        when feedback.participant_claim is null then null
        else now()
      end,
      updated_at = now()
  where feedback.activity_id = p_activity_id
    and feedback.eligibility_state = 'eligible';

  update public.activity_post_event_outcomes
  set organizer_roster_finalized_at = now(),
      updated_at = now()
  where activity_id = p_activity_id;

  perform go_irl_private.postevent_recompute_event_resolution(p_activity_id);

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.attendance_finalized',
    'activity_post_event_outcome',
    p_activity_id::text,
    '{}'::jsonb
  );

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = p_activity_id;

  return v_outcome;
end;
$$;

create or replace function public.go_irl_submit_activity_attendance_confirmation(
  p_feedback_id uuid,
  p_claim text
)
returns public.activity_attendance_feedback
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_feedback public.activity_attendance_feedback%rowtype;
  v_outcome public.activity_post_event_outcomes%rowtype;
  v_resolution text;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;
  if p_claim not in ('attended','absent','event_did_not_happen') then
    raise exception 'invalid participant attendance claim' using errcode = '22023';
  end if;

  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id
  for update;

  if not found or v_feedback.participant_user_key <> v_actor then
    raise exception 'feedback participant required' using errcode = '42501';
  end if;
  if v_feedback.eligibility_state <> 'eligible' then
    raise exception 'participant is not attendance eligible' using errcode = '22023';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes
  where activity_id = v_feedback.activity_id
  for update;

  if not found or v_outcome.event_resolution = 'voided' then
    raise exception 'post-event outcome unavailable' using errcode = '22023';
  end if;
  if now() < v_outcome.participant_fallback_at
     and (
       v_outcome.organizer_event_claim is null
       or (
         v_outcome.organizer_event_claim = 'happened'
         and v_outcome.organizer_roster_finalized_at is null
       )
     ) then
    raise exception 'participant confirmation not open yet' using errcode = '22023';
  end if;

  v_resolution := go_irl_private.postevent_attendance_resolution(
    v_feedback.organizer_claim,
    p_claim,
    v_feedback.eligibility_state
  );

  update public.activity_attendance_feedback
  set participant_claim = p_claim,
      participant_claimed_at = now(),
      resolution = v_resolution,
      resolved_at = case when v_resolution = 'pending' then null else now() end,
      organizer_rating = case when v_resolution = 'attended' then organizer_rating else null end,
      rating_tags = case when v_resolution = 'attended' then rating_tags else null end,
      rating_first_submitted_at = case when v_resolution = 'attended' then rating_first_submitted_at else null end,
      rating_updated_at = case when v_resolution = 'attended' then rating_updated_at else null end,
      updated_at = now()
  where id = p_feedback_id
  returning * into v_feedback;

  perform go_irl_private.postevent_recompute_event_resolution(v_feedback.activity_id);

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.participant_confirmation',
    'activity_attendance_feedback',
    p_feedback_id::text,
    jsonb_build_object('claim', p_claim)
  );

  return v_feedback;
end;
$$;

create or replace function public.go_irl_submit_organizer_rating(
  p_feedback_id uuid,
  p_rating smallint,
  p_tags text[] default null
)
returns public.activity_attendance_feedback
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_feedback public.activity_attendance_feedback%rowtype;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'organizer rating must be between 1 and 5' using errcode = '22023';
  end if;
  if p_tags is not null
     and not (p_tags <@ array['organization','communication','punctuality','safety','other']::text[]) then
    raise exception 'invalid organizer rating tags' using errcode = '22023';
  end if;

  select * into v_feedback
  from public.activity_attendance_feedback
  where id = p_feedback_id
  for update;

  if not found or v_feedback.participant_user_key <> v_actor then
    raise exception 'feedback participant required' using errcode = '42501';
  end if;
  if v_feedback.eligibility_state <> 'eligible' or v_feedback.resolution <> 'attended' then
    raise exception 'resolved attended interaction required' using errcode = '22023';
  end if;
  if v_feedback.rating_first_submitted_at is not null
     and v_now > v_feedback.rating_first_submitted_at + interval '7 days' then
    raise exception 'organizer rating edit window closed' using errcode = '22023';
  end if;

  update public.activity_attendance_feedback
  set organizer_rating = p_rating,
      rating_tags = p_tags,
      rating_first_submitted_at = coalesce(rating_first_submitted_at, v_now),
      rating_updated_at = v_now,
      updated_at = v_now
  where id = p_feedback_id
  returning * into v_feedback;

  perform go_irl_private.postevent_write_audit(
    v_actor,
    'activity_post_event.organizer_rating_submitted',
    'activity_attendance_feedback',
    p_feedback_id::text,
    jsonb_build_object('rating_present', true, 'tag_count', coalesce(array_length(p_tags, 1), 0))
  );

  return v_feedback;
end;
$$;

create or replace function public.go_irl_get_activity_post_event_organizer_state(p_activity_id uuid)
returns table(
  activity_id uuid,
  event_resolution text,
  organizer_event_claim text,
  organizer_responded_at timestamptz,
  organizer_roster_finalized_at timestamptz,
  participant_fallback_at timestamptz,
  feedback_id uuid,
  participant_display_name text,
  eligibility_state text,
  organizer_draft_absent boolean,
  organizer_claim text,
  participant_claim text,
  attendance_resolution text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_outcome public.activity_post_event_outcomes%rowtype;
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  select * into v_outcome
  from public.activity_post_event_outcomes outcome
  where outcome.activity_id = p_activity_id;

  if not found or v_outcome.organizer_user_key <> v_actor then
    raise exception 'activity organizer required' using errcode = '42501';
  end if;

  return query
  select
    v_outcome.activity_id,
    v_outcome.event_resolution,
    v_outcome.organizer_event_claim,
    v_outcome.organizer_responded_at,
    v_outcome.organizer_roster_finalized_at,
    v_outcome.participant_fallback_at,
    feedback.id,
    feedback.participant_display_name,
    feedback.eligibility_state,
    feedback.organizer_draft_absent,
    feedback.organizer_claim,
    feedback.participant_claim,
    feedback.resolution
  from public.activity_attendance_feedback feedback
  where feedback.activity_id = p_activity_id
    and feedback.eligibility_state = 'eligible'
  order by feedback.participant_display_name, feedback.id;
end;
$$;

create or replace function public.go_irl_get_activity_post_event_participant_state(p_feedback_id uuid)
returns table(
  feedback_id uuid,
  activity_id uuid,
  event_resolution text,
  organizer_event_claim text,
  participant_fallback_at timestamptz,
  eligibility_state text,
  organizer_claim text,
  participant_claim text,
  attendance_resolution text,
  organizer_rating smallint,
  rating_tags text[],
  rating_first_submitted_at timestamptz,
  rating_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
begin
  if v_actor is null then
    raise exception 'trusted authenticated user required' using errcode = '42501';
  end if;

  return query
  select
    feedback.id,
    feedback.activity_id,
    outcome.event_resolution,
    outcome.organizer_event_claim,
    outcome.participant_fallback_at,
    feedback.eligibility_state,
    feedback.organizer_claim,
    feedback.participant_claim,
    feedback.resolution,
    feedback.organizer_rating,
    feedback.rating_tags,
    feedback.rating_first_submitted_at,
    feedback.rating_updated_at
  from public.activity_attendance_feedback feedback
  join public.activity_post_event_outcomes outcome on outcome.activity_id = feedback.activity_id
  where feedback.id = p_feedback_id
    and feedback.participant_user_key = v_actor;
end;
$$;

revoke all on function public.go_irl_record_activity_post_event_outcome(uuid,text) from public, anon;
revoke all on function public.go_irl_toggle_activity_post_event_absence(uuid,boolean) from public, anon;
revoke all on function public.go_irl_finalize_activity_post_event_attendance(uuid) from public, anon;
revoke all on function public.go_irl_submit_activity_attendance_confirmation(uuid,text) from public, anon;
revoke all on function public.go_irl_submit_organizer_rating(uuid,smallint,text[]) from public, anon;
revoke all on function public.go_irl_get_activity_post_event_organizer_state(uuid) from public, anon;
revoke all on function public.go_irl_get_activity_post_event_participant_state(uuid) from public, anon;

grant execute on function public.go_irl_record_activity_post_event_outcome(uuid,text) to authenticated;
grant execute on function public.go_irl_toggle_activity_post_event_absence(uuid,boolean) to authenticated;
grant execute on function public.go_irl_finalize_activity_post_event_attendance(uuid) to authenticated;
grant execute on function public.go_irl_submit_activity_attendance_confirmation(uuid,text) to authenticated;
grant execute on function public.go_irl_submit_organizer_rating(uuid,smallint,text[]) to authenticated;
grant execute on function public.go_irl_get_activity_post_event_organizer_state(uuid) to authenticated;
grant execute on function public.go_irl_get_activity_post_event_participant_state(uuid) to authenticated;

-- Forward-only backfill: current non-cancelled future Activities only.
insert into public.activity_post_event_outcomes(
  activity_id,
  organizer_user_key,
  city_id,
  event_timezone,
  event_date,
  event_time,
  event_starts_at,
  event_ends_at,
  organizer_prompt_at,
  organizer_reminder_at,
  participant_fallback_at,
  event_resolution,
  updated_at
)
select
  activity.id,
  activity.organizer_key,
  activity.city_id,
  go_irl_private.postevent_activity_timezone(activity.city_id),
  activity.event_date,
  activity.event_time,
  go_irl_private.postevent_activity_starts_at(activity.event_date, activity.event_time, activity.city_id),
  go_irl_private.postevent_activity_starts_at(activity.event_date, activity.event_time, activity.city_id)
    + make_interval(mins => go_irl_private.postevent_activity_duration_minutes(activity.activity_type, activity.metadata)),
  go_irl_private.postevent_local_day_time(activity.event_date, 1, 10, activity.city_id),
  go_irl_private.postevent_local_day_time(activity.event_date, 1, 12, activity.city_id),
  go_irl_private.postevent_local_day_time(activity.event_date, 1, 14, activity.city_id),
  'pending',
  now()
from public.activities activity
join public.app_users organizer_user
  on organizer_user.user_key = activity.organizer_key
 and organizer_user.status = 'active'
where go_irl_private.postevent_activity_timezone(activity.city_id) is not null
  and go_irl_private.postevent_activity_starts_at(activity.event_date, activity.event_time, activity.city_id) > now()
  and coalesce(activity.series_occurrence_status, 'scheduled') <> 'cancelled'
on conflict (activity_id) do nothing;

insert into public.activity_attendance_feedback(
  activity_id,
  participant_user_key,
  participant_display_name,
  organizer_user_key,
  eligibility_state,
  eligible_at,
  resolution,
  updated_at
)
select
  member.activity_id,
  member.user_key,
  member.display_name,
  outcome.organizer_user_key,
  'eligible',
  now(),
  'pending',
  now()
from public.activity_members member
join public.activity_post_event_outcomes outcome on outcome.activity_id = member.activity_id
join public.app_users participant_user
  on participant_user.user_key = member.user_key
 and participant_user.status = 'active'
where member.status = 'joined'
  and member.user_key <> outcome.organizer_user_key
  and outcome.event_starts_at > now()
  and outcome.event_resolution = 'pending'
on conflict (activity_id, participant_user_key) do nothing;

notify pgrst, 'reload schema';

commit;
