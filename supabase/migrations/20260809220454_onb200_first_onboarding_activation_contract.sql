-- GO IRL ONB200-A: protected first-onboarding activation contract.
-- Additive schema only. Do not apply to production without a separate approval gate.

create schema if not exists go_irl_private;

revoke all on schema go_irl_private from public;
revoke all on schema go_irl_private from anon;
revoke all on schema go_irl_private from authenticated;

create table if not exists public.user_handles (
  user_key text primary key references public.app_users(user_key),
  nickname text not null,
  normalized_nickname text not null,
  created_at timestamptz not null default now(),
  constraint user_handles_nickname_length_check
    check (char_length(normalized_nickname) between 3 and 24),
  constraint user_handles_nickname_format_check
    check (normalized_nickname ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  constraint user_handles_nickname_normalized_check
    check (nickname = normalized_nickname),
  constraint user_handles_normalized_nickname_unique
    unique (normalized_nickname)
);

create table if not exists public.user_onboarding_activations (
  user_key text primary key references public.app_users(user_key),
  is_18_or_older boolean not null,
  terms_version text not null,
  terms_accepted_at timestamptz not null,
  privacy_version text not null,
  privacy_accepted_at timestamptz not null,
  completed_at timestamptz not null,
  constraint user_onboarding_activations_adult_check
    check (is_18_or_older = true)
);

alter table public.user_handles enable row level security;
alter table public.user_onboarding_activations enable row level security;

drop policy if exists "user handles own read" on public.user_handles;
create policy "user handles own read"
on public.user_handles for select to authenticated
using (user_key = public.go_irl_auth_user_key());

drop policy if exists "user onboarding activations own read" on public.user_onboarding_activations;
create policy "user onboarding activations own read"
on public.user_onboarding_activations for select to authenticated
using (user_key = public.go_irl_auth_user_key());

revoke all on table public.user_handles from public;
revoke all on table public.user_handles from anon;
revoke all on table public.user_handles from authenticated;
revoke all on table public.user_onboarding_activations from public;
revoke all on table public.user_onboarding_activations from anon;
revoke all on table public.user_onboarding_activations from authenticated;

create or replace function go_irl_private.reject_first_onboarding_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'first onboarding evidence is immutable' using errcode = '55000';
end;
$$;

drop trigger if exists user_handles_immutable on public.user_handles;
create trigger user_handles_immutable
before update or delete on public.user_handles
for each row
execute function go_irl_private.reject_first_onboarding_mutation();

drop trigger if exists user_onboarding_activations_immutable on public.user_onboarding_activations;
create trigger user_onboarding_activations_immutable
before update or delete on public.user_onboarding_activations
for each row
execute function go_irl_private.reject_first_onboarding_mutation();

create or replace function go_irl_private.get_my_first_onboarding_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
  v_result jsonb;
begin
  if v_user_key is null then
    raise exception 'trusted authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.app_users app_user
    where app_user.user_key = v_user_key
      and app_user.status = 'active'
  ) then
    raise exception 'active trusted user required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'completed', true,
    'nickname', handle.nickname,
    'is_18_or_older', activation.is_18_or_older,
    'terms_version', activation.terms_version,
    'terms_accepted_at', activation.terms_accepted_at,
    'privacy_version', activation.privacy_version,
    'privacy_accepted_at', activation.privacy_accepted_at,
    'completed_at', activation.completed_at
  )
  into v_result
  from public.user_onboarding_activations activation
  join public.user_handles handle using (user_key)
  where activation.user_key = v_user_key;

  return coalesce(v_result, jsonb_build_object('completed', false));
end;
$$;

create or replace function go_irl_private.complete_my_first_onboarding_impl(
  p_nickname text,
  p_is_18_or_older boolean,
  p_terms_version text,
  p_privacy_version text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_terms_version constant text := '2026-07-29';
  c_privacy_version constant text := '2026-07-14';
  v_user_key text := public.go_irl_auth_user_key();
  v_nickname text := lower(btrim(coalesce(p_nickname, '')));
  v_now timestamptz;
  v_existing jsonb;
begin
  if v_user_key is null then
    raise exception 'trusted authentication required' using errcode = '42501';
  end if;

  select app_user.user_key
  into v_user_key
  from public.app_users app_user
  where app_user.user_key = v_user_key
    and app_user.status = 'active'
  for update;

  if v_user_key is null then
    raise exception 'active trusted user required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'completed', true,
    'nickname', handle.nickname,
    'is_18_or_older', activation.is_18_or_older,
    'terms_version', activation.terms_version,
    'terms_accepted_at', activation.terms_accepted_at,
    'privacy_version', activation.privacy_version,
    'privacy_accepted_at', activation.privacy_accepted_at,
    'completed_at', activation.completed_at
  )
  into v_existing
  from public.user_onboarding_activations activation
  join public.user_handles handle using (user_key)
  where activation.user_key = v_user_key;

  if v_existing is not null then
    if v_existing ->> 'nickname' = v_nickname
       and p_is_18_or_older is true
       and p_terms_version = v_existing ->> 'terms_version'
       and p_privacy_version = v_existing ->> 'privacy_version' then
      return v_existing;
    end if;

    raise exception 'first onboarding is already completed' using errcode = '55000';
  end if;

  if char_length(v_nickname) not between 3 and 24
     or v_nickname !~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$' then
    raise exception 'invalid nickname' using errcode = '23514';
  end if;

  if v_nickname ~ '^(goirl|admin|support|moderator|official)(_|$)' then
    raise exception 'reserved nickname' using errcode = '23514';
  end if;

  if p_is_18_or_older is distinct from true then
    raise exception '18+ confirmation required' using errcode = '23514';
  end if;

  if p_terms_version is distinct from c_terms_version then
    raise exception 'current terms version required' using errcode = '23514';
  end if;

  if p_privacy_version is distinct from c_privacy_version then
    raise exception 'current privacy version required' using errcode = '23514';
  end if;

  v_now := statement_timestamp();

  insert into public.user_handles (
    user_key,
    nickname,
    normalized_nickname,
    created_at
  ) values (
    v_user_key,
    v_nickname,
    v_nickname,
    v_now
  );

  insert into public.user_onboarding_activations (
    user_key,
    is_18_or_older,
    terms_version,
    terms_accepted_at,
    privacy_version,
    privacy_accepted_at,
    completed_at
  ) values (
    v_user_key,
    true,
    c_terms_version,
    v_now,
    c_privacy_version,
    v_now,
    v_now
  );

  return jsonb_build_object(
    'completed', true,
    'nickname', v_nickname,
    'is_18_or_older', true,
    'terms_version', c_terms_version,
    'terms_accepted_at', v_now,
    'privacy_version', c_privacy_version,
    'privacy_accepted_at', v_now,
    'completed_at', v_now
  );
end;
$$;

revoke all on function go_irl_private.reject_first_onboarding_mutation() from public;
revoke all on function go_irl_private.reject_first_onboarding_mutation() from anon;
revoke all on function go_irl_private.reject_first_onboarding_mutation() from authenticated;
revoke all on function go_irl_private.get_my_first_onboarding_impl() from public;
revoke all on function go_irl_private.get_my_first_onboarding_impl() from anon;
revoke all on function go_irl_private.get_my_first_onboarding_impl() from authenticated;
revoke all on function go_irl_private.complete_my_first_onboarding_impl(text, boolean, text, text) from public;
revoke all on function go_irl_private.complete_my_first_onboarding_impl(text, boolean, text, text) from anon;
revoke all on function go_irl_private.complete_my_first_onboarding_impl(text, boolean, text, text) from authenticated;

grant usage on schema go_irl_private to authenticated;
grant execute on function go_irl_private.get_my_first_onboarding_impl() to authenticated;
grant execute on function go_irl_private.complete_my_first_onboarding_impl(text, boolean, text, text) to authenticated;

create or replace function public.get_my_first_onboarding()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select go_irl_private.get_my_first_onboarding_impl();
$$;

create or replace function public.complete_my_first_onboarding(
  p_nickname text,
  p_is_18_or_older boolean,
  p_terms_version text,
  p_privacy_version text
)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select go_irl_private.complete_my_first_onboarding_impl($1, $2, $3, $4);
$$;

revoke all on function public.get_my_first_onboarding() from public;
revoke all on function public.get_my_first_onboarding() from anon;
revoke all on function public.get_my_first_onboarding() from authenticated;
revoke all on function public.complete_my_first_onboarding(text, boolean, text, text) from public;
revoke all on function public.complete_my_first_onboarding(text, boolean, text, text) from anon;
revoke all on function public.complete_my_first_onboarding(text, boolean, text, text) from authenticated;

grant execute on function public.get_my_first_onboarding() to authenticated;
grant execute on function public.complete_my_first_onboarding(text, boolean, text, text) to authenticated;

notify pgrst, 'reload schema';
