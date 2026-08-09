-- GO IRL ONB200-A verification.
-- Run only in a disposable/test database after the ONB200-A migration.
-- All verification data is rolled back.

begin;

insert into public.app_users (auth_provider, provider_user_id, user_key, telegram_id, first_name, status)
values
  ('telegram', 'onb200-verify-a', 'telegram:991000001', 991000001, 'Onboarding A', 'active'),
  ('telegram', 'onb200-verify-b', 'telegram:991000002', 991000002, 'Onboarding B', 'active'),
  ('telegram', 'onb200-verify-blocked', 'telegram:991000003', 991000003, 'Onboarding Blocked', 'blocked');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","go_irl_user_key":"telegram:991000001"}', true);

do $$
begin
  begin
    perform count(*) from public.user_handles;
    raise exception 'direct handle read allowed';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform count(*) from public.user_onboarding_activations;
    raise exception 'direct activation read allowed';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

select public.complete_my_first_onboarding(
  'verify_user',
  true,
  '2026-07-29',
  '2026-07-14'
);

do $$
declare
  v_first jsonb;
  v_second jsonb;
begin
  v_first := public.get_my_first_onboarding();
  if v_first ->> 'completed' <> 'true' then
    raise exception 'onboarding completion not readable through RPC';
  end if;
  if v_first ->> 'nickname' <> 'verify_user' then
    raise exception 'nickname normalization mismatch';
  end if;

  v_second := public.complete_my_first_onboarding(
    'VERIFY_USER',
    true,
    '2026-07-29',
    '2026-07-14'
  );
  if v_second ->> 'completed_at' <> v_first ->> 'completed_at' then
    raise exception 'idempotent replay changed completion evidence';
  end if;

  begin
    perform public.complete_my_first_onboarding('other_name', true, '2026-07-29', '2026-07-14');
    raise exception 'completed onboarding mutation allowed';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"role":"authenticated","go_irl_user_key":"telegram:991000002"}', true);

do $$
begin
  begin
    perform public.complete_my_first_onboarding('admin_team', true, '2026-07-29', '2026-07-14');
    raise exception 'reserved nickname allowed';
  exception when sqlstate '23514' then null;
  end;

  begin
    perform public.complete_my_first_onboarding('bad__name', true, '2026-07-29', '2026-07-14');
    raise exception 'invalid nickname allowed';
  exception when sqlstate '23514' then null;
  end;

  begin
    perform public.complete_my_first_onboarding('verify_user', true, '2026-07-29', '2026-07-14');
    raise exception 'duplicate nickname allowed';
  exception when unique_violation then null;
  end;

  begin
    perform public.complete_my_first_onboarding('verify_b', false, '2026-07-29', '2026-07-14');
    raise exception 'under-18 activation allowed';
  exception when sqlstate '23514' then null;
  end;

  begin
    perform public.complete_my_first_onboarding('verify_b', true, 'old-terms', '2026-07-14');
    raise exception 'stale terms allowed';
  exception when sqlstate '23514' then null;
  end;

  begin
    perform public.complete_my_first_onboarding('verify_b', true, '2026-07-29', 'old-privacy');
    raise exception 'stale privacy allowed';
  exception when sqlstate '23514' then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"role":"authenticated","go_irl_user_key":"telegram:991000003"}', true);

do $$
begin
  begin
    perform public.complete_my_first_onboarding('blocked_user', true, '2026-07-29', '2026-07-14');
    raise exception 'blocked user activation allowed';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

reset role;

do $$
begin
  begin
    update public.user_handles
    set nickname = 'mutated', normalized_nickname = 'mutated'
    where user_key = 'telegram:991000001';
    raise exception 'immutable handle update allowed';
  exception when sqlstate '55000' then null;
  end;

  begin
    delete from public.user_onboarding_activations
    where user_key = 'telegram:991000001';
    raise exception 'immutable activation delete allowed';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

rollback;
