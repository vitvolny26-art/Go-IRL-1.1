-- COMM-001: allow one canonical Telegram forum supergroup to host many event topics.
-- Bounded schema-only migration. No production data rewrite.

begin;

alter table public.activity_external_telegram_chats
  add column if not exists telegram_message_thread_id bigint,
  add column if not exists topic_created_at timestamptz,
  add column if not exists topic_delete_after timestamptz,
  add column if not exists topic_deleted_at timestamptz;

alter table public.activity_external_telegram_chats
  drop constraint if exists activity_external_telegram_chats_url_check;

alter table public.activity_external_telegram_chats
  add constraint activity_external_telegram_chats_url_check check (
    url ~ '^https://t\.me/(?:joinchat/[-_A-Za-z0-9]+|\+[-_A-Za-z0-9]+|c/[0-9]+/[0-9]+|[A-Za-z0-9_]{5,}(?:/[0-9]+)?)$'
  );

alter table public.activity_external_telegram_chats
  drop constraint if exists activity_external_telegram_chats_message_thread_check;

alter table public.activity_external_telegram_chats
  add constraint activity_external_telegram_chats_message_thread_check check (
    telegram_message_thread_id is null or telegram_message_thread_id > 0
  );

alter table public.activity_external_telegram_chats
  drop constraint if exists activity_external_telegram_chats_topic_schedule_check;

alter table public.activity_external_telegram_chats
  add constraint activity_external_telegram_chats_topic_schedule_check check (
    topic_delete_after is null
    or topic_created_at is null
    or topic_delete_after >= topic_created_at
  );

drop index if exists public.activity_external_telegram_chats_chat_id_uidx;

create unique index if not exists activity_external_telegram_chats_topic_uidx
  on public.activity_external_telegram_chats (telegram_chat_id, telegram_message_thread_id)
  where telegram_chat_id is not null
    and telegram_message_thread_id is not null;

create index if not exists activity_external_telegram_chats_topic_cleanup_idx
  on public.activity_external_telegram_chats (topic_delete_after)
  where telegram_message_thread_id is not null
    and topic_delete_after is not null
    and topic_deleted_at is null;

comment on column public.activity_external_telegram_chats.telegram_message_thread_id is
  'Telegram forum topic message_thread_id. Multiple activities may share one canonical supergroup chat_id.';

comment on column public.activity_external_telegram_chats.topic_delete_after is
  'Earliest time at which the event forum topic may be deleted by the lifecycle worker.';

comment on column public.activity_external_telegram_chats.topic_deleted_at is
  'Timestamp recorded after Telegram confirms deletion of the event forum topic.';

commit;
