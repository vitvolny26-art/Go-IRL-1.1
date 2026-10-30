-- Kino000(SR): durable publication-attempt evidence.
-- Prepared only; do not apply without the separate production schema approval.

create table if not exists public.cinema_sr_publication_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  week_key text not null check (week_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[.][.][0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  source_run_id text not null check (length(btrim(source_run_id)) between 1 and 240),
  rank smallint not null check (rank between 1 and 7),
  catalog_movie_id uuid not null references public.cinema_catalog_movies(id),
  candidate_key text not null check (length(btrim(candidate_key)) between 1 and 240),
  status text not null check (status in ('started','succeeded','failed','unknown')),
  catalog_event_id uuid references public.city_posters_events(id),
  telegram_chat_id bigint,
  telegram_message_id bigint,
  provider_outcome text check (provider_outcome is null or provider_outcome in ('published','reused','failed','unknown')),
  independent_receipt text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_key, source_run_id, rank),
  check (finished_at is null or finished_at >= started_at),
  check (telegram_message_id is null or telegram_message_id > 0),
  check (telegram_chat_id is null or telegram_chat_id <> 0),
  check (status <> 'succeeded' or (
    provider_outcome = 'published' and catalog_event_id is not null and
    telegram_message_id is not null and independent_receipt is not null and
    length(btrim(independent_receipt)) > 0 and finished_at is not null
  ))
);

create index if not exists cinema_sr_publication_attempts_scope_idx
  on public.cinema_sr_publication_attempts (week_key, source_run_id, rank);

alter table public.cinema_sr_publication_attempts enable row level security;
alter table public.cinema_sr_publication_attempts force row level security;

create or replace function public.cinema_sr_publication_attempts_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'cinema_sr_publication_attempts_append_only';
  end if;
  if tg_op = 'UPDATE' then
    if new.attempt_id <> old.attempt_id or new.week_key <> old.week_key or
       new.source_run_id <> old.source_run_id or new.rank <> old.rank or
       new.catalog_movie_id <> old.catalog_movie_id or new.candidate_key <> old.candidate_key or
       new.started_at <> old.started_at or new.created_at <> old.created_at then
      raise exception 'cinema_sr_publication_attempt_identity_immutable';
    end if;
    if old.status in ('succeeded','failed','unknown') then
      raise exception 'cinema_sr_publication_attempt_terminal_immutable';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists cinema_sr_publication_attempts_guard on public.cinema_sr_publication_attempts;
create trigger cinema_sr_publication_attempts_guard
before update or delete on public.cinema_sr_publication_attempts
for each row execute function public.cinema_sr_publication_attempts_guard();

revoke all on table public.cinema_sr_publication_attempts from anon, authenticated;
