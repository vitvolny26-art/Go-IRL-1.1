do $verify$
declare
  v_constraint text;
  v_trigger text;
  v_claim text;
begin
  select pg_get_constraintdef(oid) into v_constraint
  from pg_constraint
  where conrelid = 'public.event_notifications'::regclass
    and conname = 'event_notifications_kind_check';
  if position('activity.organizer_join_alert' in coalesce(v_constraint, '')) = 0 then
    raise exception 'chrem002c_kind_missing';
  end if;

  select pg_get_functiondef(
    'public.go_irl_queue_organizer_join_alert()'::regprocedure
  ) into v_trigger;
  if position('new.status <> ''joined''' in v_trigger) = 0
     or position('member.user_key <> v_activity.organizer_key' in v_trigger) = 0
     or position('rollingPending' in v_trigger) = 0
     or position('previousTelegramMessageId' in v_trigger) = 0 then
    raise exception 'chrem002c_join_trigger_contract_missing';
  end if;

  select pg_get_functiondef(
    'public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure
  ) into v_claim;
  if position('activity.organizer_join_alert' in v_claim) = 0
     or position('activity.organizer_join_alert_private_telegram_unavailable' in v_claim) = 0
     or position('telegram_route.channel = ''telegram''' in v_claim) = 0 then
    raise exception 'chrem002c_private_telegram_claim_missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.event_notifications'::regclass
      and tgname = 'event_notifications_reschedule_pending_organizer_join_alert'
      and not tgisinternal
  ) then
    raise exception 'chrem002c_rolling_reschedule_trigger_missing';
  end if;
end;
$verify$;
