begin;

alter table public.user_roles
drop constraint if exists user_roles_role_check;

alter table public.user_roles
add constraint user_roles_role_check
check (role in ('user', 'organizer', 'professional', 'moderator', 'admin', 'superadmin'));

create or replace function private.go_irl_request_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.go_irl_request_has_role(array['admin', 'superadmin']);
$$;

create or replace function private.go_irl_request_can_moderate()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.go_irl_request_has_role(array['moderator', 'admin', 'superadmin']);
$$;

drop policy if exists "beauty share cards staff read" on public.beauty_share_cards;
create policy "beauty share cards staff read"
on public.beauty_share_cards for select to authenticated
using (
  coalesce(auth.jwt() ->> 'go_irl_role', '') = any(array['admin', 'superadmin', 'organizer'])
);

notify pgrst, 'reload schema';

commit;
