-- Activ020 recurring organizer approval. Source-only migration; no deployment authorization.
create table if not exists public.activity_recurring_invite_approvals (
  id uuid primary key default gen_random_uuid(),
  source_activity_id uuid not null references public.activities(id) on delete cascade,
  next_event_date date not null,
  organizer_key text not null,
  status text not null default 'pending'
    check (status in ('pending','sending','prompted','same','none','skipped')),
  telegram_message_id bigint,
  updated_at timestamptz not null default now(),
  unique (source_activity_id,next_event_date)
);
create index if not exists activity_recurring_invite_approvals_status_idx
  on public.activity_recurring_invite_approvals(status,next_event_date);
alter table public.activity_recurring_invite_approvals enable row level security;
alter table public.activity_recurring_invite_approvals force row level security;
revoke all on public.activity_recurring_invite_approvals from public,anon,authenticated;
grant all on public.activity_recurring_invite_approvals to service_role;
comment on table public.activity_recurring_invite_approvals is
  'Activ020 recurring approval: no next Activity or invitation before owner confirmation.';
