begin;

-- UProfile017 / Activ018 organizer trust summary.
-- Canonical truth remains in Activities + POSTEVENT tables. This function is a
-- rebuildable read projection only; it does not create or maintain rating/count state.
--
-- Deliberately RPC-only: do not expose a public SELECT view over raw attendance
-- feedback. SECURITY DEFINER is used only to aggregate across rows hidden by raw
-- participant RLS, and the result contains no participant identity or feedback detail.
create or replace function public.go_irl_get_organizer_stats(p_organizer_user_key text)
returns table (
  average_rating numeric,
  rating_count bigint,
  completed_activity_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  with target as (
    select nullif(btrim(p_organizer_user_key), '') as organizer_user_key
  ),
  rating_stats as (
    select
      round(avg(feedback.organizer_rating::numeric), 1) as average_rating,
      count(*)::bigint as rating_count
    from public.activity_attendance_feedback feedback
    join public.activity_post_event_outcomes outcome
      on outcome.activity_id = feedback.activity_id
     and outcome.organizer_user_key = feedback.organizer_user_key
    cross join target
    where target.organizer_user_key is not null
      and feedback.organizer_user_key = target.organizer_user_key
      and feedback.eligibility_state = 'eligible'
      and feedback.resolution = 'attended'
      and feedback.organizer_rating is not null
      and outcome.event_resolution = 'confirmed_happened'
  ),
  completed_stats as (
    select count(distinct outcome.activity_id)::bigint as completed_activity_count
    from public.activity_post_event_outcomes outcome
    cross join target
    where target.organizer_user_key is not null
      and outcome.organizer_user_key = target.organizer_user_key
      and outcome.event_resolution = 'confirmed_happened'
  )
  select
    rating_stats.average_rating,
    rating_stats.rating_count,
    completed_stats.completed_activity_count
  from rating_stats
  cross join completed_stats;
$function$;

comment on function public.go_irl_get_organizer_stats(text) is
  'Derived organizer trust summary from eligible attended participant ratings and confirmed-happened post-event outcomes. No independent reputation state.';

revoke all on function public.go_irl_get_organizer_stats(text) from public, anon;
grant execute on function public.go_irl_get_organizer_stats(text) to authenticated, service_role;

commit;
