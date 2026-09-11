-- Admin005 verification. Run only after the matching migration in an approved
-- local/staging environment. Every data change is rolled back.
-- Activ015 note: generic invitation redemption is verified with professional because
-- organizer redemption now intentionally requires ten qualifying completed Activities.

begin;

do $$
declare
  v_created record;
  v_redeemed record;
begin
  select * into v_created
  from public.go_irl_create_role_invitation(
    repeat('a', 64),
    'professional',
    'telegram:900000001',
    now() + interval '24 hours' - interval '1 second'
  );

  if v_created.id is null then
    raise exception 'role_invitation_create_failed';
  end if;

  select * into v_redeemed
  from public.go_irl_redeem_role_invitation(
    repeat('a', 64),
    'telegram:900000002'
  );

  if v_redeemed.status <> 'accepted' or v_redeemed.target_role <> 'professional' then
    raise exception 'role_invitation_redeem_failed';
  end if;

  select * into v_redeemed
  from public.go_irl_redeem_role_invitation(
    repeat('a', 64),
    'telegram:900000003'
  );

  if v_redeemed.status <> 'invalid' then
    raise exception 'role_invitation_reuse_not_rejected';
  end if;

  insert into public.user_roles (user_key, role, note)
  values ('telegram:900000004', 'moderator', 'Admin005 verification')
  on conflict (user_key) do update set role = excluded.role;

  perform public.go_irl_create_role_invitation(
    repeat('b', 64),
    'professional',
    'telegram:900000001',
    now() + interval '24 hours' - interval '1 second'
  );

  select * into v_redeemed
  from public.go_irl_redeem_role_invitation(
    repeat('b', 64),
    'telegram:900000004'
  );

  if v_redeemed.status <> 'role_conflict' then
    raise exception 'elevated_role_overwrite_not_rejected';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'role_invitations'
      and column_name = 'token'
  ) then
    raise exception 'raw_token_column_present';
  end if;

  raise notice 'Admin005 role invitation verification: PASS';
end;
$$;

rollback;
