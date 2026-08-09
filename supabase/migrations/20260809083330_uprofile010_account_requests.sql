create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_key text not null references public.app_users(user_key) on update cascade on delete restrict,
  kind text not null check (kind = any (array['data_export'::text, 'account_deletion'::text])),
  correlation_id text not null,
  status text not null default 'queued' check (status = any (array['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])),
  last_error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint account_requests_correlation_id_check check (
    correlation_id = btrim(correlation_id)
    and char_length(correlation_id) between 8 and 160
    and correlation_id !~ '[[:cntrl:]]'
  ),
  constraint account_requests_user_correlation_unique unique (user_key, correlation_id)
);

comment on table public.account_requests is
  'UProfile010 durable user-owned queue for data-export and account-deletion requests. Requests do not execute deletion directly.';
comment on column public.account_requests.correlation_id is
  'Client-generated idempotency/correlation identifier; unique per user.';

create index if not exists account_requests_user_status_created_idx
  on public.account_requests (user_key, status, created_at desc);

alter table public.account_requests enable row level security;

revoke all on table public.account_requests from anon, authenticated;
grant select, insert, update, delete on table public.account_requests to service_role;
