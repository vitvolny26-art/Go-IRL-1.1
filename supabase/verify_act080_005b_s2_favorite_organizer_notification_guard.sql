-- ACT080-005B-S2 verification. Read-only assertions inside a rollback-only transaction.

begin;

do $$
declare
  v_function_def text;
  v_trigger_def text;
begin
  select pg_get_functiondef('public.go_irl_queue_favorite_organizer_activity_notification()'::regprocedure)
  into v_function_def;

  if position('new.series_id is not null and new.series_occurrence_no is distinct from 1' in v_function_def) = 0 then
    raise exception 'ACT080-005B-S2 series fanout guard missing';
  end if;

  if position('social.favorite_organizer_event_created' in v_function_def) = 0 then
    raise exception 'favorite-organizer event-created notification kind missing';
  end if;

  if position('favorite.subject_type = ''organizer''' in v_function_def) = 0
    or position('favorite.status = ''active''' in v_function_def) = 0 then
    raise exception 'favorite-organizer follower filter changed unexpectedly';
  end if;

  select pg_get_triggerdef(trigger.oid)
  into v_trigger_def
  from pg_trigger trigger
  where trigger.tgrelid = 'public.activities'::regclass
    and trigger.tgname = 'activities_queue_favorite_organizer_notification'
    and not trigger.tgisinternal;

  if v_trigger_def is null
    or position('AFTER INSERT' in v_trigger_def) = 0
    or position('FOR EACH ROW' in v_trigger_def) = 0 then
    raise exception 'favorite-organizer Activity insert trigger missing or changed';
  end if;
end;
$$;

rollback;
