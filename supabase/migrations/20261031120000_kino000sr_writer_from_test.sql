CREATE OR REPLACE FUNCTION public.cinema_catalog_wednesday_write_v1(p_city_id text, p_week_start date, p_week_end date, p_movies jsonb)
 RETURNS TABLE(movie_count integer, screening_count integer, identity_readback jsonb)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_count integer;v_screenings integer;v_movie jsonb;v_screen jsonb;v_id uuid;v_source text;v_rank integer;v_seen text[]:=array[]::text[];v_seen_screen text[]:=array[]::text[];v_existing_row public.cinema_catalog_movies%rowtype;v_readback jsonb;
begin
if current_user <> 'service_role' then raise exception 'sr_writer_service_role_required';end if;
if p_city_id is null or p_city_id !~ '^[a-z0-9_-]{1,80}$' or p_week_start is null or p_week_end is null or p_week_end<>p_week_start+13 then raise exception 'sr_writer_week_or_city_invalid';end if;
if jsonb_typeof(p_movies) is distinct from 'array' or jsonb_array_length(p_movies) not between 8 and 10 then raise exception 'sr_writer_requires_8_to_10_ready';end if;
perform pg_advisory_xact_lock(hashtextextended(p_city_id||':'||p_week_start::text,0));
perform 1 from public.cinema_catalog_movies where city_id=p_city_id and selection_week_start=p_week_start for update;
if exists(select 1 from public.cinema_catalog_movies where city_id=p_city_id and selection_week_start=p_week_start and(publication_state<>'ready' or approved_by is not null or approved_at is not null or published_event_id is not null or published_at is not null)) then raise exception 'sr_writer_week_locked_after_approval';end if;
if exists(select 1 from public.cinema_catalog_movies c where c.city_id=p_city_id and c.selection_week_start=p_week_start and not exists(select 1 from jsonb_array_elements(p_movies) m where m->>'source_movie_key'=c.source_movie_key)) then raise exception 'sr_writer_existing_movie_omitted';end if;
for v_movie in select value from jsonb_array_elements(p_movies) loop
v_source:=btrim(coalesce(v_movie->>'source_movie_key',''));
if v_source='' or v_source=any(v_seen) or coalesce(v_movie->>'canonical_title','')='' or coalesce(v_movie->>'poster_url','') !~ '^https://' or coalesce(v_movie->>'description','')='' or coalesce(v_movie->>'duration_minutes','') !~ '^[1-9][0-9]*$' or coalesce(v_movie->>'rank','') !~ '^([1-9]|10)$' or coalesce(v_movie->'readiness'->>'ready','false')<>'true' or jsonb_typeof(v_movie->'genres') is distinct from 'array' or jsonb_array_length(v_movie->'genres')=0 or jsonb_typeof(v_movie->'translations') is distinct from 'object' or jsonb_typeof(v_movie->'screenings') is distinct from 'array' or jsonb_array_length(v_movie->'screenings')=0 then raise exception 'sr_writer_movie_invalid';end if;
v_rank:=(v_movie->>'rank')::integer;
if exists(select 1 from public.cinema_catalog_movies c where c.city_id=p_city_id and c.selection_week_start=p_week_start and c.rank=v_rank and c.source_movie_key<>v_source) then raise exception 'sr_writer_rank_identity_conflict';end if;
if nullif(v_movie->>'imdb_id','') is not null and (v_movie->>'imdb_id') !~ '^tt[0-9]{7,10}$' then raise exception 'sr_writer_imdb_invalid';end if;
if nullif(v_movie->>'imdb_id','') is null and not(v_movie->>'identity_kind' in('csfd','dzyga') and coalesce(v_movie->>'identity_value','') ~ '^[1-9][0-9]{0,11}$' and v_movie->'readiness'->>'identity_review_required'='false' and v_movie->'readiness'->'identity_provenance'->>'verification_status'='verified_exact' and v_movie->'readiness'->'identity_provenance'->>'source_movie_key'=v_source and v_movie->'readiness'->'identity_provenance'->>'week_key'=p_week_start::text||'..'||p_week_end::text) then raise exception 'sr_writer_non_imdb_identity_unverified';end if;
if exists(select 1 from(values('ru'),('uk'),('cs'),('en'),('pl'),('sk')) as langs(lang) where nullif(btrim(v_movie->'translations'->langs.lang->>'title'),'') is null or nullif(btrim(v_movie->'translations'->langs.lang->>'description'),'') is null) then raise exception 'sr_writer_localization_missing';end if;
v_seen:=array_append(v_seen,v_source);
select * into v_existing_row from public.cinema_catalog_movies where city_id=p_city_id and selection_week_start=p_week_start and source_movie_key=v_source for update;
if found and(v_existing_row.rank<>v_rank or v_existing_row.imdb_id is distinct from nullif(v_movie->>'imdb_id','') or(v_existing_row.original_title is not null and v_existing_row.original_title is distinct from nullif(v_movie->>'original_title','')) or(v_existing_row.release_year is not null and v_existing_row.release_year is distinct from nullif(v_movie->>'release_year','')::integer)) then raise exception 'sr_writer_existing_identity_drift';end if;
    v_id := null;
    if found and v_existing_row.readiness ? 'identity_provenance' then
      if v_movie->'readiness' ? 'identity_provenance' and EXISTS (
        SELECT 1 FROM jsonb_each(v_movie->'readiness'->'identity_provenance') incoming(key,value)
        WHERE incoming.key IN ('provider','provider_movie_id','source_movie_key','candidate_id','week_key','film_wikidata_id')
          AND v_existing_row.readiness->'identity_provenance'->incoming.key IS DISTINCT FROM incoming.value
      ) then raise exception 'sr_writer_identity_provenance_drift'; end if;
    end if;
insert into public.cinema_catalog_movies(city_id,selection_week_start,selection_week_end,rank,source_movie_key,imdb_id,canonical_title,original_title,release_year,duration_minutes,genres,age_rating,imdb_rating,poster_url,description,director,lead_actors,translations,readiness,publication_state,updated_at)values(p_city_id,p_week_start,p_week_end,v_rank,v_source,nullif(v_movie->>'imdb_id',''),v_movie->>'canonical_title',nullif(v_movie->>'original_title',''),nullif(v_movie->>'release_year','')::integer,(v_movie->>'duration_minutes')::integer,v_movie->'genres',nullif(v_movie->>'age_rating',''),nullif(v_movie->>'imdb_rating','')::numeric,v_movie->>'poster_url',v_movie->>'description',nullif(v_movie->>'director',''),coalesce(v_movie->'lead_actors','[]'::jsonb),v_movie->'translations',v_movie->'readiness','ready',now())
on conflict(city_id,selection_week_start,source_movie_key)do update set selection_week_end=excluded.selection_week_end,canonical_title=excluded.canonical_title,duration_minutes=excluded.duration_minutes,genres=excluded.genres,age_rating=excluded.age_rating,imdb_rating=excluded.imdb_rating,poster_url=excluded.poster_url,description=excluded.description,director=excluded.director,lead_actors=excluded.lead_actors,translations=excluded.translations,readiness=CASE WHEN cinema_catalog_movies.readiness ? 'identity_provenance' THEN excluded.readiness || jsonb_build_object('identity_provenance',cinema_catalog_movies.readiness->'identity_provenance') ELSE excluded.readiness END,updated_at=now()     WHERE (cinema_catalog_movies.selection_week_end,cinema_catalog_movies.canonical_title,
      cinema_catalog_movies.duration_minutes,cinema_catalog_movies.genres,cinema_catalog_movies.age_rating,
      cinema_catalog_movies.imdb_rating,cinema_catalog_movies.poster_url,cinema_catalog_movies.description,
      cinema_catalog_movies.director,cinema_catalog_movies.lead_actors,cinema_catalog_movies.translations,
      cinema_catalog_movies.readiness) IS DISTINCT FROM
      (excluded.selection_week_end,excluded.canonical_title,excluded.duration_minutes,excluded.genres,
      excluded.age_rating,excluded.imdb_rating,excluded.poster_url,excluded.description,
      excluded.director,excluded.lead_actors,excluded.translations,
      CASE WHEN cinema_catalog_movies.readiness ? 'identity_provenance' THEN
      excluded.readiness || jsonb_build_object('identity_provenance',cinema_catalog_movies.readiness->'identity_provenance')
      ELSE excluded.readiness END)
returning id into v_id;
    if v_id is null then
      select id into strict v_id from public.cinema_catalog_movies
      where city_id=p_city_id and selection_week_start=p_week_start and source_movie_key=v_source;
    end if;
v_seen_screen:=array[]::text[];
for v_screen in select value from jsonb_array_elements(v_movie->'screenings') loop
      if coalesce(v_screen->>'source_id','') = ''
        or coalesce(v_screen->>'external_screening_id','') !~ '^[0-9A-Za-z_-]+$' 
        or coalesce(v_screen->>'source_screening_key','') NOT IN (
          (v_screen->>'source_id') || '|' || (v_screen->>'external_screening_id'),
          (v_screen->>'source_id') || ':' || (v_screen->>'external_screening_id')) THEN
        raise exception 'sr_writer_screening_canonical_key_invalid';
      end if;
      v_screen := jsonb_set(v_screen, '{source_screening_key}',
        to_jsonb((v_screen->>'source_id') || ':' || (v_screen->>'external_screening_id')));
if nullif(btrim(v_screen->>'source_screening_key'),'') is null or v_screen->>'source_screening_key'=any(v_seen_screen) or nullif(btrim(v_screen->>'cinema_key'),'') is null or nullif(btrim(v_screen->>'cinema_name'),'') is null or nullif(btrim(v_screen->>'venue_timezone'),'') is null or nullif(btrim(v_screen->>'starts_at'),'') is null or coalesce(v_screen->>'ticket_url','') !~ '^https://' then raise exception 'sr_writer_screening_invalid';end if;
v_seen_screen:=array_append(v_seen_screen,v_screen->>'source_screening_key');
insert into public.cinema_catalog_screenings(catalog_movie_id,source_screening_key,cinema_key,cinema_name,cinema_address,venue_timezone,starts_at,ends_at,audio_language,subtitle_languages,version_type,format,auditorium,screening_tags,ticket_url,source_url,source_id,updated_at) values(v_id,v_screen->>'source_screening_key',v_screen->>'cinema_key',v_screen->>'cinema_name',nullif(v_screen->>'cinema_address',''),v_screen->>'venue_timezone',(v_screen->>'starts_at')::timestamptz,nullif(v_screen->>'ends_at','')::timestamptz,nullif(v_screen->>'audio_language',''),coalesce(v_screen->'subtitle_languages','[]'::jsonb),nullif(v_screen->>'version_type',''),nullif(v_screen->>'format',''),nullif(v_screen->>'auditorium',''),coalesce(v_screen->'screening_tags','[]'::jsonb),v_screen->>'ticket_url',nullif(v_screen->>'source_url',''),nullif(v_screen->>'source_id',''),now())
on conflict(catalog_movie_id,source_screening_key) do update set cinema_key=excluded.cinema_key,cinema_name=excluded.cinema_name,cinema_address=coalesce(excluded.cinema_address,cinema_catalog_screenings.cinema_address),venue_timezone=excluded.venue_timezone,starts_at=excluded.starts_at,ends_at=coalesce(excluded.ends_at,cinema_catalog_screenings.ends_at),audio_language=coalesce(excluded.audio_language,cinema_catalog_screenings.audio_language),subtitle_languages=CASE WHEN v_screen ? 'subtitle_languages' THEN excluded.subtitle_languages ELSE cinema_catalog_screenings.subtitle_languages END,version_type=coalesce(excluded.version_type,cinema_catalog_screenings.version_type),format=coalesce(excluded.format,cinema_catalog_screenings.format),auditorium=coalesce(excluded.auditorium,cinema_catalog_screenings.auditorium),screening_tags=CASE WHEN v_screen ? 'screening_tags' THEN excluded.screening_tags ELSE cinema_catalog_screenings.screening_tags END,ticket_url=excluded.ticket_url,source_url=excluded.source_url,source_id=excluded.source_id,updated_at=now()
      WHERE (cinema_catalog_screenings.cinema_key,cinema_catalog_screenings.cinema_name,
       cinema_catalog_screenings.cinema_address,cinema_catalog_screenings.venue_timezone,
       cinema_catalog_screenings.starts_at,cinema_catalog_screenings.ends_at,
       cinema_catalog_screenings.audio_language,cinema_catalog_screenings.subtitle_languages,
       cinema_catalog_screenings.version_type,cinema_catalog_screenings.format,
       cinema_catalog_screenings.auditorium,cinema_catalog_screenings.screening_tags,
       cinema_catalog_screenings.ticket_url,cinema_catalog_screenings.source_url,
       cinema_catalog_screenings.source_id) IS DISTINCT FROM
       (excluded.cinema_key,excluded.cinema_name,
       coalesce(excluded.cinema_address,cinema_catalog_screenings.cinema_address),excluded.venue_timezone,
       excluded.starts_at,coalesce(excluded.ends_at,cinema_catalog_screenings.ends_at),
       coalesce(excluded.audio_language,cinema_catalog_screenings.audio_language),
       CASE WHEN v_screen ? 'subtitle_languages' THEN excluded.subtitle_languages ELSE cinema_catalog_screenings.subtitle_languages END,
       coalesce(excluded.version_type,cinema_catalog_screenings.version_type),
       coalesce(excluded.format,cinema_catalog_screenings.format),
       coalesce(excluded.auditorium,cinema_catalog_screenings.auditorium),
       CASE WHEN v_screen ? 'screening_tags' THEN excluded.screening_tags ELSE cinema_catalog_screenings.screening_tags END,
       excluded.ticket_url,excluded.source_url,excluded.source_id);
end loop;
if(select count(*) from public.cinema_catalog_screenings where catalog_movie_id=v_id)<>jsonb_array_length(v_movie->'screenings') then raise exception 'sr_writer_stale_screenings_for_movie';end if;
end loop;
select count(*) into v_count from public.cinema_catalog_movies where city_id=p_city_id and selection_week_start=p_week_start;
select count(*) into v_screenings from public.cinema_catalog_screenings s join public.cinema_catalog_movies m on m.id=s.catalog_movie_id where m.city_id=p_city_id and m.selection_week_start=p_week_start;
if v_count<>jsonb_array_length(p_movies) or v_screenings<>(select sum(jsonb_array_length(x->'screenings'))::integer from jsonb_array_elements(p_movies)x) or exists(select 1 from public.cinema_catalog_movies m where m.city_id=p_city_id and m.selection_week_start=p_week_start and(m.publication_state<>'ready' or m.approved_by is not null or m.published_at is not null)) then raise exception 'sr_writer_exact_readback_failed';end if;
select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'rank',m.rank,'source_movie_key',m.source_movie_key,'screenings',(select count(*) from public.cinema_catalog_screenings s where s.catalog_movie_id=m.id)) order by m.rank),'[]'::jsonb) into v_readback from public.cinema_catalog_movies m where m.city_id=p_city_id and m.selection_week_start=p_week_start;
if exists(select 1 from jsonb_array_elements(p_movies)x where not exists(select 1 from jsonb_array_elements(v_readback)y where y->>'source_movie_key'=x->>'source_movie_key' and(y->>'rank')::integer=(x->>'rank')::integer and(y->>'screenings')::integer=jsonb_array_length(x->'screenings'))) then raise exception 'sr_writer_identity_readback_failed';end if;
return query select v_count,v_screenings,v_readback;
end;$function$
