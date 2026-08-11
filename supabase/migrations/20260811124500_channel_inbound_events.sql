begin;

create table if not exists public.channel_inbound_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null check (length(event_id) > 0),
  provider text not null check (provider = 'meta'),
  channel text not null check (channel in ('messenger', 'instagram', 'whatsapp')),
  account_id text check (account_id is null or length(account_id) > 0),
  sender_id text not null check (length(sender_id) > 0),
  conversation_id text not null check (length(conversation_id) > 0),
  event_type text not null check (event_type in (
    'message.text',
    'message.interactive',
    'postback',
    'referral'
  )),
  provider_timestamp timestamptz,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  processing_status text not null default 'queued' check (processing_status in (
    'queued',
    'processing',
    'processed',
    'failed',
    'dead_letter'
  )),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 20),
  leased_at timestamptz,
  next_attempt_at timestamptz,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint channel_inbound_events_idempotency_key
    unique nulls not distinct (provider, channel, account_id, event_id)
);

create index if not exists channel_inbound_events_due_idx
on public.channel_inbound_events(coalesce(next_attempt_at, received_at), id)
where processing_status in ('queued', 'failed');

create index if not exists channel_inbound_events_lease_idx
on public.channel_inbound_events(leased_at, id)
where processing_status = 'processing';

alter table public.channel_inbound_events enable row level security;
revoke all on table public.channel_inbound_events from public, anon, authenticated;

create or replace function public.go_irl_enqueue_channel_inbound_event(
  p_event_id text,
  p_provider text,
  p_channel text,
  p_account_id text,
  p_sender_id text,
  p_conversation_id text,
  p_event_type text,
  p_provider_timestamp timestamptz,
  p_received_at timestamptz,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted_id uuid;
begin
  if p_provider <> 'meta' then raise exception 'unsupported_provider'; end if;
  if p_channel not in ('messenger', 'instagram', 'whatsapp') then
    raise exception 'unsupported_channel';
  end if;
  if p_event_id is null or length(p_event_id) = 0 then raise exception 'invalid_event_id'; end if;
  if p_sender_id is null or length(p_sender_id) = 0 then raise exception 'invalid_sender_id'; end if;
  if p_conversation_id is null or length(p_conversation_id) = 0 then
    raise exception 'invalid_conversation_id';
  end if;
  if p_event_type not in ('message.text', 'message.interactive', 'postback', 'referral') then
    raise exception 'unsupported_event_type';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  insert into public.channel_inbound_events (
    event_id,
    provider,
    channel,
    account_id,
    sender_id,
    conversation_id,
    event_type,
    provider_timestamp,
    received_at,
    payload
  ) values (
    p_event_id,
    p_provider,
    p_channel,
    p_account_id,
    p_sender_id,
    p_conversation_id,
    p_event_type,
    p_provider_timestamp,
    coalesce(p_received_at, now()),
    p_payload
  )
  on conflict on constraint channel_inbound_events_idempotency_key do nothing
  returning id into v_inserted_id;

  return case when v_inserted_id is null then 'duplicate' else 'queued' end;
end;
$$;

create or replace function public.go_irl_claim_channel_inbound_events(
  p_limit integer default 50,
  p_lease_seconds integer default 300
)
returns table (
  id uuid,
  event_id text,
  provider text,
  channel text,
  account_id text,
  sender_id text,
  conversation_id text,
  event_type text,
  provider_timestamp timestamptz,
  received_at timestamptz,
  payload jsonb,
  attempt_count smallint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'invalid_claim_limit';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 1800 then
    raise exception 'invalid_lease_seconds';
  end if;

  update public.channel_inbound_events inbound
  set processing_status = 'dead_letter',
      leased_at = null,
      next_attempt_at = null,
      last_error_code = coalesce(inbound.last_error_code, 'attempt_limit_exhausted'),
      updated_at = now()
  where inbound.processing_status = 'processing'
    and inbound.attempt_count >= 20
    and inbound.leased_at is not null
    and inbound.leased_at <= now() - make_interval(secs => p_lease_seconds);

  return query
  with due as (
    select inbound.id
    from public.channel_inbound_events inbound
    where inbound.attempt_count < 20
      and (
        inbound.processing_status = 'queued'
        or (
          inbound.processing_status = 'failed'
          and inbound.next_attempt_at is not null
          and inbound.next_attempt_at <= now()
        )
        or (
          inbound.processing_status = 'processing'
          and inbound.leased_at is not null
          and inbound.leased_at <= now() - make_interval(secs => p_lease_seconds)
        )
      )
    order by coalesce(inbound.next_attempt_at, inbound.received_at), inbound.id
    for update of inbound skip locked
    limit p_limit
  ),
  claimed as (
    update public.channel_inbound_events inbound
    set processing_status = 'processing',
        attempt_count = inbound.attempt_count + 1,
        leased_at = now(),
        next_attempt_at = null,
        updated_at = now()
    from due
    where inbound.id = due.id
    returning inbound.*
  )
  select
    claimed.id,
    claimed.event_id,
    claimed.provider,
    claimed.channel,
    claimed.account_id,
    claimed.sender_id,
    claimed.conversation_id,
    claimed.event_type,
    claimed.provider_timestamp,
    claimed.received_at,
    claimed.payload,
    claimed.attempt_count
  from claimed;
end;
$$;

create or replace function public.go_irl_finish_channel_inbound_event(
  p_channel_inbound_event_id uuid,
  p_outcome text,
  p_error_code text default null,
  p_retry_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome is null or p_outcome not in ('processed', 'retry', 'failed', 'dead_letter') then
    raise exception 'invalid_inbound_outcome';
  end if;
  if p_outcome = 'retry' and p_retry_at is null then
    raise exception 'retry_time_required';
  end if;

  update public.channel_inbound_events inbound
  set processing_status = case
        when p_outcome = 'processed' then 'processed'
        when p_outcome = 'retry' and inbound.attempt_count >= 20 then 'dead_letter'
        when p_outcome = 'retry' then 'failed'
        when p_outcome = 'failed' then 'failed'
        else 'dead_letter'
      end,
      next_attempt_at = case
        when p_outcome = 'retry' and inbound.attempt_count < 20 then p_retry_at
        else null
      end,
      leased_at = null,
      processed_at = case when p_outcome = 'processed' then now() else null end,
      last_error_code = case
        when p_outcome = 'processed' then null
        else left(coalesce(p_error_code, p_outcome), 120)
      end,
      updated_at = now()
  where inbound.id = p_channel_inbound_event_id
    and inbound.processing_status = 'processing';

  if not found then raise exception 'channel_inbound_event_not_claimed'; end if;
end;
$$;

revoke all on function public.go_irl_enqueue_channel_inbound_event(
  text, text, text, text, text, text, text, timestamptz, timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.go_irl_enqueue_channel_inbound_event(
  text, text, text, text, text, text, text, timestamptz, timestamptz, jsonb
) to service_role;

revoke all on function public.go_irl_claim_channel_inbound_events(integer, integer)
from public, anon, authenticated;
grant execute on function public.go_irl_claim_channel_inbound_events(integer, integer)
to service_role;

revoke all on function public.go_irl_finish_channel_inbound_event(uuid, text, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.go_irl_finish_channel_inbound_event(uuid, text, text, timestamptz)
to service_role;

notify pgrst, 'reload schema';

commit;
