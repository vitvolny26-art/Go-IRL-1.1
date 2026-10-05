begin;

alter table public.cinema_catalog_movies
  drop constraint if exists cinema_catalog_movies_publication_state_check;

alter table public.cinema_catalog_movies
  add constraint cinema_catalog_movies_publication_state_check
  check (publication_state in (
    'ready',
    'proposed',
    'approved',
    'publishing',
    'published',
    'rejected',
    'skipped'
  ));

create or replace function public.claim_cinema_catalog_movie_for_publication(
  p_catalog_movie_id uuid
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  update public.cinema_catalog_movies
  set
    publication_state = 'publishing',
    updated_at = now()
  where id = p_catalog_movie_id
    and publication_state = 'approved'
  returning id;
$$;

revoke all on function public.claim_cinema_catalog_movie_for_publication(uuid) from public;
revoke all on function public.claim_cinema_catalog_movie_for_publication(uuid) from anon, authenticated;
grant execute on function public.claim_cinema_catalog_movie_for_publication(uuid) to service_role;

comment on function public.claim_cinema_catalog_movie_for_publication(uuid) is
  'Atomically claims one owner-approved compact Cinema movie for publication; only service_role may execute it.';

notify pgrst, 'reload schema';

commit;
