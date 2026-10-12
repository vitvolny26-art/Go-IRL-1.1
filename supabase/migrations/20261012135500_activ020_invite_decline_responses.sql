-- Activ020: track invitation declines independently of participation.
-- Only service_role may write responses after a verified Telegram callback.
create table if not exists public.activity_invite_responses (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_key text not null,
  display_name text not null,
  response text not null default 'declined' check (response = 'declined'),
  responded_at timestamptz not null default now(),
  organizer_notified_at timestamptz,
  primary key (activity_id, user_key)
);
alter table public.activity_invite_responses enable row level security;
revoke all on public.activity_invite_responses from anon, authenticated;
grant select, insert, update, delete on public.activity_invite_responses to service_role;
comment on table public.activity_invite_responses is
  'Activ020 Telegram invitation declines, not membership and not join requests';
