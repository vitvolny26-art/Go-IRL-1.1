-- People003A: independent named teams. Source migration only; NOT applied to production.
begin;

create table public.named_teams (
  id uuid primary key default gen_random_uuid(),
  owner_user_key text not null references public.app_users(user_key) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  visibility text not null default 'private' check (visibility = 'private'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.named_team_memberships (
  team_id uuid not null references public.named_teams(id) on delete cascade,
  user_key text not null references public.app_users(user_key) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'invited' check (status in ('invited','active','declined','left','removed')),
  updated_at timestamptz not null default now(),
  primary key (team_id,user_key)
);

create index named_team_memberships_user_idx on public.named_team_memberships(user_key, status);
create unique index named_team_single_owner_idx on public.named_team_memberships(team_id) where role = 'owner';

alter table public.named_teams enable row level security;
alter table public.named_team_memberships enable row level security;

revoke all on public.named_teams, public.named_team_memberships from public, anon, authenticated;
grant select, insert on public.named_teams to authenticated;
grant select on public.named_team_memberships to authenticated;

-- Actor-scoped team visibility. Owners can always see their own teams;
-- invited and active users may see teams addressed to them.
create policy named_teams_read on public.named_teams for select to authenticated
using (
  owner_user_key = public.go_irl_auth_user_key()
  or id in (
    select m.team_id from public.named_team_memberships m
    where m.user_key = public.go_irl_auth_user_key()
      and m.status in ('invited','active')
  )
);

create policy named_teams_create on public.named_teams for insert to authenticated
with check (owner_user_key = public.go_irl_auth_user_key());

-- Membership visibility is limited to the row subject or the team owner.
-- No direct membership writes are granted; mutation RPCs will be added after
-- security review, avoiding privilege escalation through client-side role edits.
create policy named_team_memberships_read on public.named_team_memberships
for select to authenticated using (
  user_key = public.go_irl_auth_user_key()
  or exists (
    select 1 from public.named_teams t
    where t.id = team_id and t.owner_user_key = public.go_irl_auth_user_key()
  )
);

-- Owner membership is created only by the trusted insert trigger.
create or replace function public.go_irl_named_team_seed_owner()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public as $$
begin
  insert into public.named_team_memberships(team_id,user_key,role,status)
  values (new.id,new.owner_user_key,'owner','active');
  return new;
end;
$$;
revoke all on function public.go_irl_named_team_seed_owner() from public, anon, authenticated;
create trigger named_team_seed_owner after insert on public.named_teams
for each row execute function public.go_irl_named_team_seed_owner();

notify pgrst, 'reload schema';
commit;
