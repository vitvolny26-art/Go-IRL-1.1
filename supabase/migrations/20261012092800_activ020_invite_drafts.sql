-- Activ020: isolated Telegram invitation drafts. Source migration only; DO NOT
-- apply to production before separate approval of the migration deployment.
-- These records are not rows in public.activities and cannot enter existing
-- Activities discovery, notification, recurrence or publication consumers.
create table if not exists public.activity_invite_drafts (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null unique default gen_random_uuid(),
  organizer_key text not null,
  activity_payload jsonb not null,
  state text not null default 'pending',
  prepared_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint activity_invite_drafts_state_check
    check (state in ('pending', 'prepared', 'sent', 'published', 'cancelled')),
  constraint activity_invite_drafts_payload_object_check
    check (jsonb_typeof(activity_payload) = 'object'),
  constraint activity_invite_drafts_expiry_check
    check (expires_at > created_at)
);

create index if not exists activity_invite_drafts_owner_created_idx
  on public.activity_invite_drafts (organizer_key, created_at desc);

alter table public.activity_invite_drafts enable row level security;
alter table public.activity_invite_drafts force row level security;

-- No public or anonymous access. Only the authenticated owner may stage or
-- read their draft. Neither client-side UPDATE nor DELETE is granted: the
-- preparation, sent-confirmation and publication transitions require a
-- separately reviewed privileged server implementation.
revoke all on public.activity_invite_drafts from public, anon, authenticated;
grant select, insert on public.activity_invite_drafts to authenticated;
grant all on public.activity_invite_drafts to service_role;

create policy "activ020 draft owner select"
  on public.activity_invite_drafts for select to authenticated
  using (organizer_key = public.go_irl_auth_user_key());

create policy "activ020 draft owner insert"
  on public.activity_invite_drafts for insert to authenticated
  with check (
    organizer_key = public.go_irl_auth_user_key()
    and state = 'pending'
    and prepared_message_id is null
    and expires_at <= now() + interval '24 hours'
  );

comment on table public.activity_invite_drafts is
  'Activ020 hidden pre-publication Telegram invitation drafts. Must never be joined into normal Activity listings. Server-only lifecycle transitions.';
