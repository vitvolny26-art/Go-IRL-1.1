-- ACT080-005B-S2: a recurring Activity series materializes ordinary Activity rows.
-- Favorite-organizer creation notifications must fan out once per created series,
-- while preserving the existing per-Activity behavior for non-series events.

begin;

create or replace function public.go_irl_queue_favorite_organizer_activity_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_favorite record;
  v_snapshot jsonb;
begin
  if new.visibility = 'private' then
    return new;
  end if;

  -- ACT080-005B: a weekly series is inserted as N ordinary Activity rows in one RPC.
  -- Notify followers from the first occurrence only; later occurrences remain fully
  -- independent Activities without multiplying the organizer-created notification.
  if new.series_id is not null and new.series_occurrence_no is distinct from 1 then
    return new;
  end if;

  v_snapshot := public.go_irl_event_snapshot(new) || jsonb_build_object(
    'organizerUserKey', new.organizer_key,
    'organizerName', new.organizer
  );

  for v_favorite in
    select favorite.user_key
    from public.favorites favorite
    where favorite.subject_type = 'organizer'
      and favorite.organizer_user_key = new.organizer_key
      and favorite.status = 'active'
      and favorite.user_key <> new.organizer_key
  loop
    insert into public.event_notifications (
      user_key,
      activity_id,
      kind,
      payload,
      delivery_key
    ) values (
      v_favorite.user_key,
      new.id,
      'social.favorite_organizer_event_created',
      v_snapshot,
      'favorite-organizer:' || v_favorite.user_key || ':' || new.organizer_key || ':' || new.id::text
    )
    on conflict (delivery_key) do nothing;
  end loop;

  return new;
end;
$$;

revoke execute on function public.go_irl_queue_favorite_organizer_activity_notification()
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
