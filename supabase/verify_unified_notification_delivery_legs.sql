-- Verifier for M1 unified notification delivery legs.
-- Intended to run after the migration in a disposable/verification database.

begin;

do $$
declare
  claim_definition text;
  leg_claim_definition text;
  leg_finish_definition text;
  policy_count integer;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_notifications'
      and column_name = 'delivery_mode' and column_default like '%legacy_single_route%'
  ) then raise exception 'event_notifications delivery_mode default missing'; end if;

  if to_regclass('public.notification_delivery_legs') is null then
    raise exception 'notification_delivery_legs table missing';
  end if;

  select count(*) into policy_count
  from pg_policies
  where schemaname = 'public' and tablename = 'notification_delivery_legs'
    and policyname = 'notification delivery legs own read';
  if policy_count <> 1 then raise exception 'notification_delivery_legs own-read RLS policy missing'; end if;

  if has_table_privilege('authenticated','public.notification_delivery_legs','insert')
     or has_table_privilege('authenticated','public.notification_delivery_legs','update')
     or has_table_privilege('authenticated','public.notification_delivery_legs','delete')
  then raise exception 'authenticated can mutate notification_delivery_legs directly'; end if;

  if not has_table_privilege('authenticated','public.notification_delivery_legs','select') then
    raise exception 'authenticated own-read surface not granted';
  end if;

  select pg_get_functiondef('public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure)
  into claim_definition;
  if claim_definition not like '%notification.delivery_mode = ''legacy_single_route''%' then
    raise exception 'legacy notification claim guard missing';
  end if;
  if claim_definition not like '%notification.status = ''failed''%'
     or claim_definition not like '%notification.next_attempt_at is not null%'
  then raise exception 'terminal failed notification guard regressed'; end if;

  select pg_get_functiondef('public.go_irl_claim_notification_delivery_legs(text[],integer,integer)'::regprocedure)
  into leg_claim_definition;
  if leg_claim_definition not like '%for update of leg skip locked%'
     or leg_claim_definition not like '%leg.leg_type = ''external''%'
     or leg_claim_definition not like '%leg.status = ''failed''%leg.next_attempt_at is not null%'
  then raise exception 'delivery leg claim contract incomplete'; end if;

  select pg_get_functiondef('public.go_irl_finish_notification_delivery_leg(uuid,text,text,timestamptz,text)'::regprocedure)
  into leg_finish_definition;
  if leg_finish_definition not like '%leg.status = ''sending''%'
     or leg_finish_definition not like '%communication_delivery_audit%'
  then raise exception 'delivery leg finish contract incomplete'; end if;

  if has_function_privilege('authenticated','public.go_irl_claim_notification_delivery_legs(text[],integer,integer)','execute')
     or has_function_privilege('authenticated','public.go_irl_finish_notification_delivery_leg(uuid,text,text,timestamptz,text)','execute')
  then raise exception 'authenticated can execute service-only delivery leg functions'; end if;

  if not has_function_privilege('service_role','public.go_irl_claim_notification_delivery_legs(text[],integer,integer)','execute')
     or not has_function_privilege('service_role','public.go_irl_finish_notification_delivery_leg(uuid,text,text,timestamptz,text)','execute')
  then raise exception 'service_role delivery leg function grants missing'; end if;
end
$$;
rollback;
