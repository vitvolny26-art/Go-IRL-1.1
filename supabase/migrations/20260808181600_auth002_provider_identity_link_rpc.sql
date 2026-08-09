begin;

create or replace function public.go_irl_link_provider_identity(
  p_user_key text,
  p_provider text,
  p_provider_binding_id text
)
returns table(status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing_user_key text;
  v_existing_status text;
begin
  if p_user_key is null or btrim(p_user_key) = ''
    or p_provider is null or p_provider not in ('google', 'facebook')
    or p_provider_binding_id is null or btrim(p_provider_binding_id) = ''
  then
    return query select 'invalid'::text;
    return;
  end if;

  select identity.user_key, identity.status
  into v_existing_user_key, v_existing_status
  from public.user_provider_identities identity
  where identity.provider = p_provider
    and identity.provider_user_id = p_provider_binding_id
  for update;

  if found then
    if v_existing_user_key <> p_user_key then
      return query select 'identity_conflict'::text;
      return;
    end if;

    if v_existing_status = 'active' then
      return query select 'already_linked'::text;
      return;
    end if;

    update public.user_provider_identities
    set status = 'active', updated_at = now()
    where provider = p_provider
      and provider_user_id = p_provider_binding_id
      and user_key = p_user_key;

    insert into public.audit_log (actor_user_key, action, entity_type, entity_id, metadata)
    values (p_user_key, 'identity.relinked', 'user_provider_identity', p_provider, jsonb_build_object('provider', p_provider));

    return query select 'linked'::text;
    return;
  end if;

  begin
    insert into public.user_provider_identities (
      user_key,
      provider,
      provider_user_id,
      status,
      updated_at
    ) values (
      p_user_key,
      p_provider,
      p_provider_binding_id,
      'active',
      now()
    );
  exception when unique_violation then
    select identity.user_key, identity.status
    into v_existing_user_key, v_existing_status
    from public.user_provider_identities identity
    where identity.provider = p_provider
      and identity.provider_user_id = p_provider_binding_id;

    if v_existing_user_key = p_user_key then
      return query select 'already_linked'::text;
    else
      return query select 'identity_conflict'::text;
    end if;
    return;
  end;

  insert into public.audit_log (actor_user_key, action, entity_type, entity_id, metadata)
  values (p_user_key, 'identity.linked', 'user_provider_identity', p_provider, jsonb_build_object('provider', p_provider));

  return query select 'linked'::text;
end;
$$;

revoke execute on function public.go_irl_link_provider_identity(text, text, text)
from public, anon, authenticated;
grant execute on function public.go_irl_link_provider_identity(text, text, text)
to service_role;

notify pgrst, 'reload schema';

commit;
