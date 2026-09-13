begin;

-- Activ015: backend-first Activity publication quota and organizer eligibility gate.
-- Ordinary users may create at most 2 Activities per Europe/Prague calendar day.
-- Users whose exact persisted global role is organizer may create at most 5.
-- The BEFORE INSERT trigger covers both direct Activity inserts and recurring-series RPC inserts.

create table if not exists public.activity_daily_publish_usage (
  user_key text not null,
  local_date date not null,
  publish_count integer not null default 0 check (publish_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_key, local_date)
);

revoke all on table public.activity_daily_publish_usage from public, anon, authenticated;

-- Preserve already-created Activities from the migration day so applying Activ015 cannot
-- accidentally grant extra slots to users who published earlier the same calendar day.
insert into public.activity_daily_publish_usage (user_key, local_date, publish_count)
select
  activity.organizer_key,
  (activity.created_at at time zone 'Europe/Prague')::date,
  count(*)::integer
from public.activities activity
where activity.created_at >= ((now() at time zone 'Europe/Prague')::date::timestamp at time zone 'Europe/Prague')
  and activity.created_at < ((((now() at time zone 'Europe/Prague')::date + 1)::timestamp) at time zone 'Europe/Prague'))
group by activity.organizer_key, (activity.created_at at time zone 'Europe/Prague')::date
on conflict (user_key, local_date) do update
set publish_count = greatest(public.activity_daily_publish_usage.publish_count, excluded.publish_count),
    updated_at = now();

create or replace function go_irl_private.activ015_enforce_activity_daily_publish_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor text := public.go_irl_auth_user_key();
  v_role text;
  v_limit integer;
  v_now timestamptz := statement_timestamp();
  v_local_day date;
  v_usage_count integer;
begin
  -- Trusted server/service-role jobs do not carry an end-user JWT and retain their
  -- existing internal write behavior. End-user writes always carry v_actor.
  if v_actor is null then
    return new;
  end if;

  if new.organizer_key is distinct from v_actor then
    raise exception 'activity organizer identity mismatch'
      using errcode = '42501';
  end if;

  -- Do not allow an authenticated client to backdate created_at around the quota.
  new.created_at := v_now;
  v_local_day := (v_now at time zone 'Europe/Prague')::date;

  select role
  into v_role
  from public.user_roles
  where user_key = v_actor
  limit 1;

  v_limit := case when v_role = 'organizer' then 5 else 2 end;

  -- This upsert is the concurrency boundary. The primary-key row lock serializes
  -- parallel creates, and each row in a multi-row recurring INSERT consumes one slot.
  -- If any occurrence exceeds the limit, the raised exception rolls back the whole
  -- Activity/series transaction and every usage increment made by that transaction.
  insert into public.activity_daily_publish_usage (
    user_key,
    local_date,
    publish_count,
    created_at,
    updated_at
  ) values (
    v_actor,
    v_local_day,
    1,
    v_now,
    v_now
  )
  on conflict (user_key, local_date) do update
  set publish_count = public.activity_daily_publish_usage.publish_count + 1,
      updated_at = excluded.updated_at
  where public.activity_daily_publish_usage.publish_count < v_limit
  returning publish_count into v_usage_count;

  if v_usage_count is null or v_usage_count > v_limit then
    raise exception 'activity_daily_publish_limit_reached'
      using
        errcode = 'P0001',
        detail = format(
          'user_key=%s role=%s local_day=%s limit=%s',
          v_actor,
          coalesce(v_role, 'user'),
          v_local_day,
          v_limit
        );
  end if;

  return new;
end;
$$;

revoke all on function go_irl_private.activ015_enforce_activity_daily_publish_limit()
from public, anon, authenticated;

drop trigger if exists activ015_activity_daily_publish_limit on public.activities;
create trigger activ015_activity_daily_publish_limit
before insert on public.activities
for each row
execute function go_irl_private.activ015_enforce_activity_daily_publish_limit();

-- A qualifying Activity is a completed Activity with confirmed-happened outcome and
-- at least one eligible non-organizer participant whose attendance resolved to attended.
-- Safety/fraud/integrity review remains the administrator's manual approval responsibility;
-- no parallel moderation or trust store is introduced here.
create or replace function go_irl_private.activ015_organizer_qualifying_activity_count(p_user_key text)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct outcome.activity_id)::integer
  from public.activity_post_event_outcomes outcome
  where outcome.organizer_user_key = p_user_key
    and outcome.organizer_event_claim = 'happened'
    and outcome.event_resolution = 'confirmed_happened'
    and exists (
      select 1
      from public.activity_attendance_feedback feedback
      where feedback.activity_id = outcome.activity_id
        and feedback.participant_user_key <> p_user_key
        and feedback.eligibility_state = 'eligible'
        and feedback.resolution = 'attended'
    );
$$;

revoke all on function go_irl_private.activ015_organizer_qualifying_activity_count(text)
from public, anon, authenticated;

-- Reuse the existing single-use admin role invitation as the explicit human approval.
-- Organizer redemption now additionally requires the canonical 10-Activity trust threshold.
create or replace function public.go_irl_redeem_role_invitation(
  p_token_hash text,
  p_user_key text
)
returns table(status text, target_role text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_invitation public.role_invitations%rowtype;
  v_assigned_role text;
  v_qualifying_count integer := 0;
begin
  if p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_user_key is null
    or p_user_key !~ '^telegram:[0-9]+$'
  then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  select invitation.*
  into v_invitation
  from public.role_invitations invitation
  where invitation.token_hash = p_token_hash
  for update;

  if not found
    or v_invitation.consumed_at is not null
    or v_invitation.expires_at <= now()
  then
    return query select 'invalid'::text, null::text;
    return;
  end if;

  if v_invitation.target_role = 'organizer' then
    v_qualifying_count := go_irl_private.activ015_organizer_qualifying_activity_count(p_user_key);
    if v_qualifying_count < 10 then
      return query select 'invalid'::text, null::text;
      return;
    end if;
  end if;

  insert into public.user_roles (user_key, role, note)
  values (
    p_user_key,
    v_invitation.target_role,
    'Assigned through a single-use admin role invitation'
  )
  on conflict (user_key) do update
  set role = excluded.role,
      updated_at = now()
  where public.user_roles.role = 'user'
  returning role into v_assigned_role;

  if v_assigned_role is null then
    return query select 'role_conflict'::text, null::text;
    return;
  end if;

  update public.role_invitations
  set consumed_at = now(),
      consumed_by_user_key = p_user_key
  where id = v_invitation.id;

  insert into public.audit_log (
    actor_user_key,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_user_key,
    'role_invitation.redeemed',
    'role_invitation',
    v_invitation.id::text,
    jsonb_build_object(
      'target_role', v_invitation.target_role,
      'qualifying_activity_count', case
        when v_invitation.target_role = 'organizer' then v_qualifying_count
        else null
      end
    )
  );

  return query select 'accepted'::text, v_assigned_role;
end;
$$;

revoke execute on function public.go_irl_redeem_role_invitation(text, text)
from public, anon, authenticated;
grant execute on function public.go_irl_redeem_role_invitation(text, text)
to service_role;

notify pgrst, 'reload schema';

commit;
