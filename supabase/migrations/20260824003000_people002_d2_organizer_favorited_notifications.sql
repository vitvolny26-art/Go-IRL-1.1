-- PEOPLE002-D2: notify an organizer through the existing durable notification outbox
-- when an organizer Favorite becomes active.
-- Repository-only migration. Production apply requires separate explicit approval.
-- No new table, RLS/Auth change, or historical Favorite backfill.

begin;
alter table public.event_notifications drop constraint if exists event_notifications_kind_check;
alter table public.event_notifications add constraint event_notifications_kind_check check (kind in ('join_confirmed','join_pending','join_waitlisted','request_approved','request_rejected','event_changed','event_cancelled','social.favorited','social.favorite_organizer_event_created','services.booking_requested','services.booking_confirmed','services.booking_declined','services.booking_cancelled','services.booking_rescheduled','services.waitlist_slot_available','services.booking_reminder_24h','services.booking_reminder_3h'));
create or replace function public.go_irl_queue_organizer_favorited_notification() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_delivery_key text;
begin
  if new.subject_type <> 'organizer' or new.status <> 'active' or new.organizer_user_key is null then return new; end if;
  if tg_op = 'UPDATE' and old.subject_type = 'organizer' and old.status = 'active' and old.organizer_user_key is not distinct from new.organizer_user_key then return new; end if;
  v_delivery_key := 'social:favorited:' || new.id::text || ':' || pg_catalog.txid_current()::text || ':' || pg_catalog.clock_timestamp()::text;
  insert into public.event_notifications (user_key,activity_id,kind,payload,provider,delivery_key) values (new.organizer_user_key,null,'social.favorited',jsonb_build_object('openPath','/'),'telegram',v_delivery_key) on conflict (delivery_key) do nothing;
  return new;
end;
$$;
revoke execute on function public.go_irl_queue_organizer_favorited_notification() from public, anon, authenticated;
drop trigger if exists favorites_queue_organizer_favorited_notification on public.favorites;
create trigger favorites_queue_organizer_favorited_notification after insert or update on public.favorites for each row execute function public.go_irl_queue_organizer_favorited_notification();
notify pgrst, 'reload schema';
commit;
