begin;

create or replace function public.cinema_lock_weekly_publication_ranking(
  p_weekly_selection_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_selection public.cinema_weekly_publication_selections%rowtype;
  v_candidate_count integer;
begin
  if p_weekly_selection_id is null then
    raise exception 'cinema_weekly_ranking_selection_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cinema_weekly_ranking:' || p_weekly_selection_id::text,
      0
    )
  );

  select * into v_selection
  from public.cinema_weekly_publication_selections
  where id = p_weekly_selection_id
  for update;

  if not found then
    raise exception 'cinema_weekly_ranking_selection_missing';
  end if;

  if v_selection.state <> 'collecting' then
    if v_selection.locked_at is null then
      raise exception 'cinema_weekly_ranking_state_inconsistent';
    end if;

    select count(*)::integer into v_candidate_count
    from public.cinema_weekly_publication_candidates
    where weekly_selection_id = p_weekly_selection_id;

    return jsonb_build_object(
      'weekly_selection_id', v_selection.id,
      'state', 'ranked',
      'locked_at', v_selection.locked_at,
      'top_limit', v_selection.top_limit,
      'candidate_count', v_candidate_count,
      'publication_authorized', false
    );
  end if;

  if v_selection.locked_at is not null then
    raise exception 'cinema_weekly_ranking_state_inconsistent';
  end if;

  if exists (
    select 1
    from public.cinema_weekly_publication_candidates
    where weekly_selection_id = p_weekly_selection_id
  ) then
    raise exception 'cinema_weekly_ranking_partial_snapshot';
  end if;

  with eligible as (
    select
      d.id as candidate_id,
      d.movie_id,
      d.city_id,
      d.city_name,
      d.title,
      d.showing_from,
      d.showing_until,
      d.score,
      d.priority,
      d.lifecycle_status,
      row_number() over (
        partition by d.movie_id
        order by
          d.score desc,
          d.showing_from asc,
          d.showing_until desc,
          d.id asc
      ) as movie_choice
    from public.cinema_daily_movie_city_candidates d
    where d.city_id = v_selection.city_id
      and d.lifecycle_status = 'active'
      and d.showing_from <= v_selection.week_end
      and d.showing_until >= v_selection.week_start
  ),
  ranked as (
    select
      e.*,
      row_number() over (
        order by
          e.score desc,
          e.showing_from asc,
          e.showing_until desc,
          e.candidate_id asc
      ) as candidate_rank
    from eligible e
    where e.movie_choice = 1
  ),
  inserted as (
    insert into public.cinema_weekly_publication_candidates(
      weekly_selection_id,
      candidate_id,
      movie_id,
      rank,
      showing_from,
      showing_until,
      score,
      publication_state,
      publication_authorized,
      snapshot
    )
    select
      v_selection.id,
      r.candidate_id,
      r.movie_id,
      r.candidate_rank::integer,
      r.showing_from,
      r.showing_until,
      r.score,
      'queued',
      false,
      jsonb_build_object(
        'candidate_id', r.candidate_id,
        'movie_id', r.movie_id,
        'city_id', r.city_id,
        'city_name', r.city_name,
        'title', r.title,
        'showing_from', r.showing_from,
        'showing_until', r.showing_until,
        'score', r.score,
        'priority', r.priority,
        'lifecycle_status', r.lifecycle_status
      )
    from ranked r
    where r.candidate_rank <= v_selection.top_limit
    order by r.candidate_rank
    returning 1
  )
  select count(*)::integer into v_candidate_count from inserted;

  update public.cinema_weekly_publication_selections
  set state = 'ranked',
      locked_at = now(),
      updated_at = now()
  where id = v_selection.id
    and state = 'collecting'
    and locked_at is null
  returning * into v_selection;

  if not found then
    raise exception 'cinema_weekly_ranking_lock_conflict';
  end if;

  return jsonb_build_object(
    'weekly_selection_id', v_selection.id,
    'state', 'ranked',
    'locked_at', v_selection.locked_at,
    'top_limit', v_selection.top_limit,
    'candidate_count', v_candidate_count,
    'publication_authorized', false
  );
end;
$function$;

revoke all on function public.cinema_lock_weekly_publication_ranking(uuid)
  from public, anon, authenticated;
grant execute on function public.cinema_lock_weekly_publication_ranking(uuid)
  to service_role;

comment on function public.cinema_lock_weekly_publication_ranking(uuid) is
  'Kino000L atomically locks one deterministic Top-10 weekly candidate snapshot. Ranking is score DESC with stable window/id tie-breakers, one candidate per movie. Re-runs are immutable/idempotent and never authorize publication.';

notify pgrst, 'reload schema';

commit;
