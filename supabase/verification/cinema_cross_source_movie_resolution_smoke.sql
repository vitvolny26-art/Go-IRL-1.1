-- TEST-only cross-source movie resolver smoke. All inserted mapping data rolls back.
begin;

do $$
declare
  canonical_id uuid;
  first_id uuid;
  second_id uuid;
  key_value text;
  mapping_count integer;
begin
  select id into canonical_id
  from public.cinema_movies
  where public.cinema_movie_match_key(title) = 'mimoni a monstra'
    and duration_minutes = 85
  order by created_at
  limit 1;

  if canonical_id is null then
    raise exception 'canonical Mimoni a monstra fixture missing';
  end if;

  key_value := public.cinema_movie_match_key('Mimoni a monstra DABING (Dětská neděle)');
  if key_value is distinct from 'mimoni a monstra' then
    raise exception 'match key failed: %', key_value;
  end if;

  first_id := public.cinema_resolve_or_create_movie(
    'cinestar_cz',
    '10824',
    'Mimoni a monstra DABING',
    'cinestar_cz:10824:unknown',
    null,
    null,
    85,
    'https://cinestar.cz/cz/olomouc/filmy/movie/10824-mimoni-a-monstra'
  );

  second_id := public.cinema_resolve_or_create_movie(
    'cinestar_cz',
    '10824',
    'Mimoni a monstra DABING',
    'cinestar_cz:10824:unknown',
    null,
    null,
    85,
    'https://cinestar.cz/cz/olomouc/filmy/movie/10824-mimoni-a-monstra'
  );

  if first_id is distinct from canonical_id or second_id is distinct from canonical_id then
    raise exception 'cross-source resolver duplicated movie: expected %, first %, second %', canonical_id, first_id, second_id;
  end if;

  select count(*) into mapping_count
  from public.cinema_movie_sources
  where source_id = 'cinestar_cz'
    and external_movie_id = '10824'
    and movie_id = canonical_id;

  if mapping_count <> 1 then
    raise exception 'expected exactly one source mapping, got %', mapping_count;
  end if;
end $$;

rollback;

select 'cinema_cross_source_movie_resolution_smoke_ok' as result;
