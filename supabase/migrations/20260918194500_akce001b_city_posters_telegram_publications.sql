-- Akce001B: tracked Telegram publication lifecycle for canonical City Posters events.
-- Repository migration only. DO NOT apply to production without separate explicit production migration approval.
begin;
create table if not exists public.city_posters_telegram_publications (
  event_id uuid primary key references public.city_posters_events(id) on delete cascade,
  city_id text not null check (btrim(city_id) <> ''),
  telegram_chat_id bigint not null,
  telegram_message_id bigint not null check (telegram_message_id > 0),
  language text not null default 'cs' check (language in ('ru','uk','cs','en','pl','sk')),
  expires_at timestamptz not null,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_error text
);
create index if not exists city_posters_telegram_publications_expiry_idx
  on public.city_posters_telegram_publications(expires_at)
  where deleted_at is null;
alter table public.city_posters_telegram_publications enable row level security;
revoke all on table public.city_posters_telegram_publications from public, anon, authenticated;
grant select, insert, update, delete on table public.city_posters_telegram_publications to service_role;
comment on table public.city_posters_telegram_publications is
  'Akce001B tracked canonical City Posters Telegram message identity. Expiry cleanup deletes the tracked Telegram message.';
commit;
