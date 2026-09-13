create extension if not exists unaccent with schema extensions;

create or replace function public.cinema_movie_match_key(p_value text)
returns text
language sql
stable
as $function$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          lower(extensions.unaccent(coalesce(p_value, ''))),
          '\s+(dabing|titulky|tit|orig|cz|2d|3d|4k)(\s*\([^)]*\))?\s*$',
          '',
          'gi'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$function$;

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
  v_match_ids uuid[];
  v_match_count integer := 0;
  v_title_key text;
  v_original_key text;
begin
  if nullif(btrim(p_source_id), '') is null then raise exception 'source_id is required'; end if;
  if nullif(btrim(p_external_movie_id), '') is null then raise exception 'external_movie_id is required'; end if;
  if nullif(btrim(p_title), '') is null then raise exception 'title is required'; end if;
  if nullif(btrim(p_movie_fingerprint), '') is null then raise exception 'movie_fingerprint is required'; end if;
  if p_duration_minutes is not null and p_duration_minutes <= 0 then raise exception 'duration_minutes must be > 0'; end if;

  perform pg_advisory_xact_lock(hashtextextended(btrim(p_source_id) || ':' || btrim(p_external_movie_id), 0));

  -- 1) Exact source provenance always wins.
  select cms.movie_id into v_movie_id
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

  -- 2) Exact deterministic movie fingerprint.
  select cm.id into v_movie_id
  from public.cinema_movies cm
  where cm.movie_fingerprint = btrim(p_movie_fingerprint)
  limit 1
  for update;

  if v_movie_id is not null then
    update public.cinema_movies
       set original_title = coalesce(original_title, nullif(btrim(p_original_title), '')),
           release_year = coalesce(release_year, p_release_year),
           duration_minutes = coalesce(duration_minutes, p_duration_minutes),
           updated_at = case
             when (original_title is null and nullif(btrim(p_original_title), '') is not null)
               or (release_year is null and p_release_year is not null)
               or (duration_minutes is null and p_duration_minutes is not null)
             then now() else updated_at end
     where id = v_movie_id;

    insert into public.cinema_movie_sources(movie_id, source_id, external_movie_id, source_url, first_seen_at, last_seen_at, created_at, updated_at)
    values(v_movie_id, btrim(p_source_id), btrim(p_external_movie_id), nullif(btrim(p_source_url), ''), now(), now(), now(), now())
    on conflict (source_id, external_movie_id) do update
      set source_url = coalesce(excluded.source_url, public.cinema_movie_sources.source_url),
          last_seen_at = now(), updated_at = now()
    returning movie_id into v_movie_id;
    return v_movie_id;
  end if;

  -- 3) Conservative cross-source fallback. This is intentionally strict.
  v_title_key := public.cinema_movie_match_key(p_title);
  v_original_key := public.cinema_movie_match_key(p_original_title);

  select array_agg(cm.id order by cm.id), count(*)::integer
    into v_match_ids, v_match_count
  from public.cinema_movies cm
  where (
      public.cinema_movie_match_key(cm.title) = v_title_key
      or (v_original_key is not null and public.cinema_movie_match_key(cm.title) = v_original_key)
      or (cm.original_title is not null and public.cinema_movie_match_key(cm.original_title) = v_title_key)
      or (v_original_key is not null and cm.original_title is not null and public.cinema_movie_match_key(cm.original_title) = v_original_key)
    )
    and (
      (p_release_year is not null
       and (cm.release_year = p_release_year or cm.release_year is null)
       and (
         p_duration_minutes is null
         or cm.duration_minutes is null
         or abs(cm.duration_minutes - p_duration_minutes) <= 15
       ))
      or
      (p_release_year is null
       and p_duration_minutes is not null
       and cm.duration_minutes is not null
       and abs(cm.duration_minutes - p_duration_minutes) <= 5)
    );

  if v_match_count > 1 then
    raise exception 'ambiguous_movie_match for source %, external movie %, title %', p_source_id, p_external_movie_id, p_title;
  elsif v_match_count = 1 then
    v_movie_id := v_match_ids[1];

    update public.cinema_movies
       set original_title = coalesce(original_title, nullif(btrim(p_original_title), '')),
           release_year = coalesce(release_year, p_release_year),
           duration_minutes = coalesce(duration_minutes, p_duration_minutes),
           updated_at = case
             when (original_title is null and nullif(btrim(p_original_title), '') is not null)
               or (release_year is null and p_release_year is not null)
               or (duration_minutes is null and p_duration_minutes is not null)
             then now() else updated_at end
     where id = v_movie_id;

    insert into public.cinema_movie_sources(movie_id, source_id, external_movie_id, source_url, first_seen_at, last_seen_at, created_at, updated_at)
    values(v_movie_id, btrim(p_source_id), btrim(p_external_movie_id), nullif(btrim(p_source_url), ''), now(), now(), now(), now())
    on conflict (source_id, external_movie_id) do update
      set source_url = coalesce(excluded.source_url, public.cinema_movie_sources.source_url),
          last_seen_at = now(), updated_at = now()
    returning movie_id into v_movie_id;
    return v_movie_id;
  end if;

  -- 4) Genuinely new movie: create/reuse by deterministic fingerprint.
  insert into public.cinema_movies(
    title, original_title, release_year, duration_minutes, movie_fingerprint, created_at, updated_at
  ) values (
    btrim(p_title), nullif(btrim(p_original_title), ''), p_release_year, p_duration_minutes,
    btrim(p_movie_fingerprint), now(), now()
  )
  on conflict (movie_fingerprint) where movie_fingerprint is not null
  do update set
    original_title = coalesce(public.cinema_movies.original_title, excluded.original_title),
    release_year = coalesce(public.cinema_movies.release_year, excluded.release_year),
    duration_minutes = coalesce(public.cinema_movies.duration_minutes, excluded.duration_minutes),
    updated_at = case
      when (public.cinema_movies.original_title is null and excluded.original_title is not null)
        or (public.cinema_movies.release_year is null and excluded.release_year is not null)
        or (public.cinema_movies.duration_minutes is null and excluded.duration_minutes is not null)
      then now() else public.cinema_movies.updated_at end
  returning id into v_movie_id;

  insert into public.cinema_movie_sources(movie_id, source_id, external_movie_id, source_url, first_seen_at, last_seen_at, created_at, updated_at)
  values(v_movie_id, btrim(p_source_id), btrim(p_external_movie_id), nullif(btrim(p_source_url), ''), now(), now(), now(), now())
  on conflict (source_id, external_movie_id) do update
    set source_url = coalesce(excluded.source_url, public.cinema_movie_sources.source_url),
        last_seen_at = now(), updated_at = now()
  returning movie_id into v_movie_id;

  return v_movie_id;
end;
$function$;

revoke execute on function public.cinema_movie_match_key(text) from public, anon, authenticated;
grant execute on function public.cinema_movie_match_key(text) to service_role;
revoke execute on function public.cinema_resolve_or_create_movie(text,text,text,text,text,integer,integer,text) from public, anon, authenticated;
grant execute on function public.cinema_resolve_or_create_movie(text,text,text,text,text,integer,integer,text) to service_role;

comment on function public.cinema_movie_match_key(text)
is 'Conservative cinema title match key: unaccent/lower/punctuation normalization plus trailing presentation-label removal.';
comment on function public.cinema_resolve_or_create_movie(text,text,text,text,text,integer,integer,text)
is 'Cinema resolver/create path: exact source mapping -> exact fingerprint -> unique conservative cross-source title/year/duration match -> create. Ambiguity raises instead of creating duplicates.';
