create or replace function public.go_irl_resolve_auth_cleanup(p_subjects jsonb)
returns table(provider text, auth_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_matched integer;
begin
  if p_subjects is null or pg_catalog.jsonb_typeof(p_subjects) <> 'array' then
    raise exception using
      errcode = 'P0001',
      message = 'account_deletion_auth_resolution_failed';
  end if;

  with requested as (
    select distinct
      pg_catalog.btrim(item.provider) as provider,
      pg_catalog.btrim(item.subject) as subject
    from pg_catalog.jsonb_to_recordset(p_subjects) as item(provider text, subject text)
    where item.provider in ('google', 'facebook')
      and pg_catalog.btrim(item.subject) <> ''
  )
  select pg_catalog.count(*)::integer into v_expected
  from requested;

  if v_expected = 0 then
    return;
  end if;

  with requested as (
    select distinct
      pg_catalog.btrim(item.provider) as provider,
      pg_catalog.btrim(item.subject) as subject
    from pg_catalog.jsonb_to_recordset(p_subjects) as item(provider text, subject text)
    where item.provider in ('google', 'facebook')
      and pg_catalog.btrim(item.subject) <> ''
  ),
  matched as (
    select distinct requested.provider, requested.subject, identity.user_id
    from requested
    join auth.identities as identity
      on identity.provider = requested.provider
     and identity.provider_id = requested.subject
  )
  select pg_catalog.count(distinct (matched.provider, matched.subject))::integer
  into v_matched
  from matched;

  if v_matched <> v_expected then
    raise exception using
      errcode = 'P0001',
      message = 'account_deletion_auth_resolution_failed';
  end if;

  return query
  with requested as (
    select distinct
      pg_catalog.btrim(item.provider) as provider,
      pg_catalog.btrim(item.subject) as subject
    from pg_catalog.jsonb_to_recordset(p_subjects) as item(provider text, subject text)
    where item.provider in ('google', 'facebook')
      and pg_catalog.btrim(item.subject) <> ''
  ),
  matched as (
    select distinct requested.provider, identity.user_id
    from requested
    join auth.identities as identity
      on identity.provider = requested.provider
     and identity.provider_id = requested.subject
  )
  select pg_catalog.min(matched.provider)::text, matched.user_id
  from matched
  group by matched.user_id;
end;
$$;

revoke all on function public.go_irl_resolve_auth_cleanup(jsonb) from public, anon, authenticated;
grant execute on function public.go_irl_resolve_auth_cleanup(jsonb) to service_role;

comment on function public.go_irl_resolve_auth_cleanup(jsonb) is
  'Service-role-only exact lookup of Supabase Auth users for GO IRL self-delete cleanup.';
