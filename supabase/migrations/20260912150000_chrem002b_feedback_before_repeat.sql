-- ChRem002B: organizer feedback must be delivered before Repeat is claimable.
-- Source-only candidate. Production apply remains a separate protected gate.

begin;

do $prerequisites$
begin
  if to_regclass('public.activity_repeat_publication_prompts') is null then
    raise exception 'chrem002b_repeat_missing_prompt_store';
  end if;
  if to_regclass('public.event_notifications') is null then
    raise exception 'chrem002b_repeat_missing_event_notifications';
  end if;
  if to_regprocedure('public.go_irl_claim_due_repeat_publication_prompts(integer,integer)') is null then
    raise exception 'chrem002b_repeat_missing_claim_rpc';
  end if;
end;
$prerequisites$;

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
  with feedback_ready as (
    select distinct notification.activity_id
    from public.event_notifications notification
    where notification.activity_id is not null
      and notification.kind = 'post_event.organizer_confirmation'
      and notification.payload ->> 'postEventStage' = 'organizer_feedback'
      and notification.status = 'sent'
      and notification.sent_at is not null
  ), due as (
    select prompt.id
    from public.activity_repeat_publication_prompts prompt
    join public.activities activity on activity.id = prompt.source_activity_id
    join feedback_ready on feedback_ready.activity_id = activity.id
    join public.user_provider_identities identity
      on identity.user_key = prompt.organizer_key
     and identity.provider = 'telegram'
     and identity.status = 'active'
     and identity.consented_at is not null
    where (
      prompt.status = 'pending'
      or (
        prompt.status = 'failed'
        and prompt.next_attempt_at is not null
        and prompt.next_attempt_at <= now()
      )
      or (
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

revoke all on function public.go_irl_claim_due_repeat_publication_prompts(integer, integer)
from public, anon, authenticated;
grant execute on function public.go_irl_claim_due_repeat_publication_prompts(integer, integer)
to service_role;

notify pgrst, 'reload schema';
commit;
