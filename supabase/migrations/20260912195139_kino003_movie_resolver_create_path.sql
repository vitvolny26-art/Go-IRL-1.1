create or replace function public.cinema_resolve_or_create_movie(
  p_source_id text,
  p_external_movie_id text,
  p_title text,
  p_movie_fingerprint text,
  p_original_title text default null,
  p_release_year integer default null,
  p_duration_minutes integer default null,
  p_source_url text default null
)
returns uuid
language plpgsql
as $function$
declare
  v_movie_id uuid;
begin
  if nullif(btrim(p_source_id), '') is null then
    raise exception 'source_id is required';
  end if;

  if nullif(btrim(p_external_movie_id), '') is null then
    raise exception 'external_movie_id is required';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'title is required';
  end if;

  if nullif(btrim(p_movie_fingerprint), '') is null then
    raise exception 'movie_fingerprint is required';
  end if;

  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception 'duration_minutes must be > 0';
  end if;

  -- Serialize competing creates for the same source movie identity.
  perform pg_advisory_xact_lock(
    hashtextextended(btrim(p_source_id) || ':' || btrim(p_external_movie_id), 0)
  );

  -- Exact provenance mapping always wins.
  select cms.movie_id
    into v_movie_id
    from public.cinema_movie_sources cms
   where cms.source_id = btrim(p_source_id)
     and cms.external_movie_id = btrim(p_external_movie_id)
   for update;

  if v_movie_id is not null then
    update public.cinema_movie_sources
       set source_url = coalesce(nullif(btrim(p_source_url), ''), source_url),
           last_seen_at = now(),
           updated_at = now()
     where source_id = btrim(p_source_id)
       and external_movie_id = btrim(p_external_movie_id);

    return v_movie_id;
  end if;

  -- Reuse an existing movie by deterministic fingerprint, otherwise create it.
  insert into public.cinema_movies (
    title,
    original_title,
    release_year,
    duration_minutes,
    movie_fingerprint,
    created_at,
    updated_at
  ) values (
    btrim(p_title),
    nullif(btrim(p_original_title), ''),
    p_release_year,
    p_duration_minutes,
    btrim(p_movie_fingerprint),
    now(),
    now()
  )
  on conflict (movie_fingerprint)
    where movie_fingerprint is not null
  do update set
    original_title = coalesce(public.cinema_movies.original_title, excluded.original_title),
    release_year = coalesce(public.cinema_movies.release_year, excluded.release_year),
    duration_minutes = coalesce(public.cinema_movies.duration_minutes, excluded.duration_minutes),
    updated_at = case
      when (public.cinema_movies.original_title is null and excluded.original_title is not null)
        or (public.cinema_movies.release_year is null and excluded.release_year is not null)
        or (public.cinema_movies.duration_minutes is null and excluded.duration_minutes is not null)
      then now()
      else public.cinema_movies.updated_at
    end
  returning id into v_movie_id;

  -- Persist source provenance without ever remapping an existing source identity.
  insert into public.cinema_movie_sources (
    movie_id,
    source_id,
    external_movie_id,
    source_url,
    first_seen_at,
    last_seen_at,
    created_at,
    updated_at
  ) values (
    v_movie_id,
    btrim(p_source_id),
    btrim(p_external_movie_id),
    nullif(btrim(p_source_url), ''),
    now(),
    now(),
    now(),
    now()
  )
  on conflict (source_id, external_movie_id)
  do update set
    source_url = coalesce(excluded.source_url, public.cinema_movie_sources.source_url),
    last_seen_at = now(),
    updated_at = now()
  returning movie_id into v_movie_id;

  return v_movie_id;
end;
$function$;

comment on function public.cinema_resolve_or_create_movie(text,text,text,text,text,integer,integer,text)
is 'Kino003 TEST resolver create path: exact source mapping -> deterministic movie_fingerprint reuse/create -> source provenance upsert. Caller must supply a stable movie_fingerprint.';
