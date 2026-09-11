begin;

-- Activ015 public-safe badge projection. Expose only whether the requested
-- canonical user key currently has the approved global organizer role.
create or replace function public.go_irl_is_verified_organizer(p_user_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_key is not null
    and p_user_key ~ '^telegram:[0-9]+$'
    and exists (
      select 1
      from public.user_roles role_assignment
      where role_assignment.user_key = p_user_key
        and role_assignment.role = 'organizer'
    );
$$;

revoke execute on function public.go_irl_is_verified_organizer(text)
from public, anon;
grant execute on function public.go_irl_is_verified_organizer(text)
to authenticated;

notify pgrst, 'reload schema';

commit;
