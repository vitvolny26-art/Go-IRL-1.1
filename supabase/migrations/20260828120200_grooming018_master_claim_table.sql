-- GROOMING018: split from the approved local onboarding migration for connector-safe commit transport.
begin;

create table if not exists public.beauty_master_onboarding_claims (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  token_hash text not null unique,
  approved_payload jsonb not null,
  prepared_by_user_key text not null references public.app_users(user_key) on delete restrict,
  prepared_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  claimed_at timestamptz,
  claimed_by_user_key text references public.app_users(user_key) on delete restrict,
  claimed_profile_id uuid references public.beauty_professional_profiles(id) on delete restrict,
  constraint beauty_master_onboarding_request_id_check
    check (request_id ~ '^GROOMING018-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint beauty_master_onboarding_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint beauty_master_onboarding_payload_check
    check (jsonb_typeof(approved_payload) = 'object'),
  constraint beauty_master_onboarding_expiry_check
    check (expires_at > prepared_at and expires_at <= prepared_at + interval '7 days'),
  constraint beauty_master_onboarding_claim_state_check
    check (
      (claimed_at is null and claimed_by_user_key is null and claimed_profile_id is null)
      or (claimed_at is not null and claimed_by_user_key is not null and claimed_profile_id is not null)
    ),
  constraint beauty_master_onboarding_revoke_state_check
    check (revoked_at is null or claimed_at is null)
);

create index if not exists beauty_master_onboarding_active_expiry_idx
on public.beauty_master_onboarding_claims(expires_at)
where claimed_at is null and revoked_at is null;

alter table public.beauty_master_onboarding_claims enable row level security;
revoke all on table public.beauty_master_onboarding_claims from public, anon, authenticated, service_role;

comment on table public.beauty_master_onboarding_claims is
  'GROOMING018 approved immutable Beauty onboarding snapshots. Raw claim tokens are never stored.';


commit;
