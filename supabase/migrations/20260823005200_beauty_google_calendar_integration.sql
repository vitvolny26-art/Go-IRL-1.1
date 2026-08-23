-- Beauty Google Calendar integration foundation.
-- Repository presence does not apply this migration to production.
-- OAuth refresh tokens are stored only as server-encrypted ciphertext and are never exposed through client RLS.

create table if not exists public.beauty_google_calendar_connections (
  profile_id uuid primary key references public.beauty_professional_profiles(id) on delete cascade,
  owner_user_key text not null references public.app_users(user_key) on delete cascade,
  refresh_token_ciphertext text not null,
  granted_scope text not null,
  sync_mode text not null default 'manual',
  calendar_id text not null default 'primary',
  last_synced_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beauty_google_calendar_connections_sync_mode_check
    check (sync_mode in ('manual', 'auto')),
  constraint beauty_google_calendar_connections_scope_check
    check (char_length(btrim(granted_scope)) between 1 and 1000),
  constraint beauty_google_calendar_connections_calendar_id_check
    check (char_length(btrim(calendar_id)) between 1 and 512),
  constraint beauty_google_calendar_connections_ciphertext_check
    check (char_length(refresh_token_ciphertext) between 32 and 8192)
);

create unique index if not exists beauty_google_calendar_connections_owner_profile_idx
on public.beauty_google_calendar_connections(owner_user_key, profile_id);

create table if not exists public.beauty_google_calendar_events (
  booking_id uuid primary key references public.beauty_bookings(id) on delete cascade,
  profile_id uuid not null references public.beauty_professional_profiles(id) on delete cascade,
  google_event_id text not null,
  synced_booking_updated_at timestamptz not null,
  last_synced_at timestamptz not null default now(),
  constraint beauty_google_calendar_events_google_id_check
    check (char_length(btrim(google_event_id)) between 1 and 1024),
  constraint beauty_google_calendar_events_profile_event_unique
    unique (profile_id, google_event_id)
);

create index if not exists beauty_google_calendar_events_profile_idx
on public.beauty_google_calendar_events(profile_id, last_synced_at desc);

drop trigger if exists beauty_google_calendar_connections_touch_updated_at
on public.beauty_google_calendar_connections;
create trigger beauty_google_calendar_connections_touch_updated_at
before update on public.beauty_google_calendar_connections
for each row
execute function public.go_irl_touch_updated_at();

alter table public.beauty_google_calendar_connections enable row level security;
alter table public.beauty_google_calendar_events enable row level security;

revoke all on table public.beauty_google_calendar_connections from public;
revoke all on table public.beauty_google_calendar_connections from anon;
revoke all on table public.beauty_google_calendar_connections from authenticated;
revoke all on table public.beauty_google_calendar_events from public;
revoke all on table public.beauty_google_calendar_events from anon;
revoke all on table public.beauty_google_calendar_events from authenticated;

comment on table public.beauty_google_calendar_connections is
  'Server-only Beauty Google Calendar OAuth connection state. Refresh tokens are AES-GCM ciphertext produced by the Edge Function; no client role has direct table privileges.';
comment on column public.beauty_google_calendar_connections.refresh_token_ciphertext is
  'AES-GCM ciphertext only. Plain Google refresh tokens must never be stored in this column, browser storage, logs or client-visible responses.';
comment on table public.beauty_google_calendar_events is
  'Server-only mapping between canonical GO IRL Beauty bookings and Google Calendar event IDs. GO IRL remains the source of truth.';

notify pgrst, 'reload schema';
