revoke all privileges
  on public.cinema_movie_schedule_v
  from authenticated, service_role;

revoke all privileges
  on public.cinema_movie_schedule_v
  from public, anon;

grant select on public.cinema_movie_schedule_v
  to authenticated, service_role;

comment on view public.cinema_movie_schedule_v is
  'Read-only city movie schedule model for GO IRL movie cards. ACL hardened to SELECT-only for authenticated and service_role.';
