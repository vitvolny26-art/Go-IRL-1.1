-- POSTEVENT001 D1 rollback-only verification.
-- Run only in an explicitly approved environment after the migration is applied.

begin;

do $verify$
declare
  v_policy text;
begin
  if to_regclass('public.activity_post_event_outcomes') is null then
    raise exception 'activity_post_event_outcomes missing';
  end if;
  if to_regclass('public.activity_attendance_feedback') is null then
    raise exception 'activity_attendance_feedback missing';
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'activity_post_event_outcomes' and c.relrowsecurity
  ) then
    raise exception 'activity_post_event_outcomes RLS disabled';
  end if;
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'activity_attendance_feedback' and c.relrowsecurity
  ) then
    raise exception 'activity_attendance_feedback RLS disabled';
  end if;

  if not has_table_privilege('authenticated', 'public.activity_post_event_outcomes', 'SELECT')
     or has_table_privilege('authenticated', 'public.activity_post_event_outcomes', 'INSERT')
     or has_table_privilege('authenticated', 'public.activity_post_event_outcomes', 'UPDATE')
     or has_table_privilege('authenticated', 'public.activity_post_event_outcomes', 'DELETE') then
    raise exception 'activity_post_event_outcomes authenticated privileges invalid';
  end if;

  if not has_table_privilege('authenticated', 'public.activity_attendance_feedback', 'SELECT')
     or has_table_privilege('authenticated', 'public.activity_attendance_feedback', 'INSERT')
     or has_table_privilege('authenticated', 'public.activity_attendance_feedback', 'UPDATE')
     or has_table_privilege('authenticated', 'public.activity_attendance_feedback', 'DELETE') then
    raise exception 'activity_attendance_feedback authenticated privileges invalid';
  end if;

  if exists (
    select 1
    from pg_constraint constraint_row
    join pg_class source_table on source_table.oid = constraint_row.conrelid
    join pg_class target_table on target_table.oid = constraint_row.confrelid
    where source_table.relname = 'activity_post_event_outcomes'
      and constraint_row.contype = 'f'
      and target_table.relname = 'activities'
  ) then
    raise exception 'activity_post_event_outcomes must not cascade from activities';
  end if;

  select qual into v_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'activity_attendance_feedback'
    and policyname = 'activity_attendance_feedback_participant_select';
  if v_policy is null or position('participant_user_key' in v_policy) = 0 then
    raise exception 'participant-only feedback policy missing';
  end if;

  if to_regprocedure('public.go_irl_record_activity_post_event_outcome(uuid,text)') is null
     or to_regprocedure('public.go_irl_toggle_activity_post_event_absence(uuid,boolean)') is null
     or to_regprocedure('public.go_irl_finalize_activity_post_event_attendance(uuid)') is null
     or to_regprocedure('public.go_irl_submit_activity_attendance_confirmation(uuid,text)') is null
     or to_regprocedure('public.go_irl_submit_organizer_rating(uuid,smallint,text[])') is null
     or to_regprocedure('public.go_irl_get_activity_post_event_organizer_state(uuid)') is null
     or to_regprocedure('public.go_irl_get_activity_post_event_participant_state(uuid)') is null then
    raise exception 'POSTEVENT001 D1 public RPC surface incomplete';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'postevent001_activity_snapshot' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'postevent001_activity_delete_guard' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'postevent001_activity_member_snapshot' and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'postevent001_protect_app_user_delete' and not tgisinternal
  ) then
    raise exception 'POSTEVENT001 D1 trigger surface incomplete';
  end if;

  if go_irl_private.postevent_activity_timezone('olomouc') <> 'Europe/Prague'
     or go_irl_private.postevent_activity_timezone('prerov') <> 'Europe/Prague'
     or go_irl_private.postevent_activity_timezone('praha') <> 'Europe/Prague'
     or go_irl_private.postevent_activity_timezone('brno') <> 'Europe/Prague'
     or go_irl_private.postevent_activity_timezone('bratislava') <> 'Europe/Bratislava'
     or go_irl_private.postevent_activity_timezone('krakow') <> 'Europe/Warsaw'
     or go_irl_private.postevent_activity_timezone('kyiv') <> 'Europe/Kyiv'
     or go_irl_private.postevent_activity_timezone('kharkiv') <> 'Europe/Kyiv'
     or go_irl_private.postevent_activity_timezone('odesa') <> 'Europe/Kyiv'
     or go_irl_private.postevent_activity_timezone('lviv') <> 'Europe/Kyiv'
     or go_irl_private.postevent_activity_timezone('unknown-city') is not null then
    raise exception 'POSTEVENT001 city timezone map invalid';
  end if;

  if go_irl_private.postevent_attendance_resolution('attended','attended','eligible') <> 'attended'
     or go_irl_private.postevent_attendance_resolution('absent','absent','eligible') <> 'absent'
     or go_irl_private.postevent_attendance_resolution('attended','absent','eligible') <> 'disputed'
     or go_irl_private.postevent_attendance_resolution('attended','event_did_not_happen','eligible') <> 'disputed'
     or go_irl_private.postevent_attendance_resolution(null,'attended','eligible') <> 'pending'
     or go_irl_private.postevent_attendance_resolution('attended','attended','withdrawn_before_start') <> 'voided' then
    raise exception 'POSTEVENT001 attendance resolution helper invalid';
  end if;
end
$verify$;

rollback;
