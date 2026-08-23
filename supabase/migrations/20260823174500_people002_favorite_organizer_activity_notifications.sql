begin;

alter table public.event_notifications drop constraint if exists event_notifications_kind_check;
alter table public.event_notifications add constraint event_notifications_kind_check check (kind in (
  'join_confirmed', 'join_pending', 'join_waitlisted', 'request_approved', 'request_rejected',
  'event_changed', 'event_cancelled', 'social.favorite_organizer_event_created',
  'services.booking_requested', 'services.booking_confirmed', 'services.booking_declined',
  'services.booking_cancelled', 'services.booking_rescheduled', 'services.waitlist_slot_available',
  'services.booking_reminder_24h', 'services.booking_reminder_3h'
));

create or replace function public.go_irl_queue_favorite_organizer_activity_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_favorite record; v_snapshot jsonb;
begin
  v_snapshot := public.go_irl_event_snapshot(new) || jsonb_build_object('organizerUserKey', new.organizer_key);
  for v_favorite in
    select favorite.user_key from public.favorites favorite
    where favorite.subject_type = 'organizer'
      and favorite.organizer_user_key = new.organizer_key
      and favorite.status = 'active'
      and favorite.user_key <> new.organizer_key
  loop
    insert into public.event_notifications (user_key, activity_id, kind, payload, delivery_key)
    values (
      v_favorite.user_key, new.id, 'social.favorite_organizer_event_created', v_snapshot,
      'favorite-organizer:' || v_favorite.user_key || ':' || new.organizer_key || ':' || new.id::text
    ) on conflict (delivery_key) do nothing;
  end loop;
  return new;
end;
$$;

revoke execute on function public.go_irl_queue_favorite_organizer_activity_notification() from public, anon, authenticated;
drop trigger if exists activities_queue_favorite_organizer_notification on public.activities;
create trigger activities_queue_favorite_organizer_notification
after insert on public.activities
for each row execute function public.go_irl_queue_favorite_organizer_activity_notification();

notify pgrst, 'reload schema';
commit;
