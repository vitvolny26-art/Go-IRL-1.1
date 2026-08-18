do $$
declare
  v_create_def text;
  v_notify_def text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'beauty_professional_profiles'
      and column_name = 'confirmation_mode'
  ) then raise exception 'confirmation_mode column missing'; end if;

  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='beauty_professional_profiles' and column_name='confirmation_mode' and column_default = '''manual'''::text) then
    raise exception 'confirmation_mode default is not manual';
  end if;

  if to_regprocedure('public.go_irl_get_my_beauty_confirmation_mode()') is null then
    raise exception 'confirmation mode read RPC missing';
  end if;
  if to_regprocedure('public.go_irl_set_my_beauty_confirmation_mode(text)') is null then
    raise exception 'confirmation mode write RPC missing';
  end if;

  select pg_get_functiondef('public.go_irl_create_beauty_booking(uuid,uuid,timestamptz,text,text,text)'::regprocedure)
  into v_create_def;
  if position('confirmation_mode' in v_create_def) = 0 or position('v_initial_status' in v_create_def) = 0 or position('confirmed_at' in v_create_def) = 0 then
    raise exception 'booking create RPC is not confirmation-mode aware';
  end if;

  select pg_get_functiondef('public.go_irl_queue_beauty_booking_notification()'::regprocedure)
  into v_notify_def;
  if position('new.to_status = ''confirmed''' in v_notify_def) = 0 then
    raise exception 'booking notification trigger is not auto-confirm aware';
  end if;
end $$;
