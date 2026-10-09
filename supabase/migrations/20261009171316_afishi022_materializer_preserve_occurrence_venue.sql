begin;
do $hotfix$
declare
  v_oid oid;
  v_definition text;
begin
  select p.oid
  into v_oid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='city_posters_materialize_candidate'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_candidate jsonb, p_city_id text, p_language text, p_timezone text, p_dry_run boolean';

  if v_oid is null then
    raise exception 'afishi022_materializer_missing_for_venue_hotfix' using errcode='55000';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  if position('venue_id=v_venue_id,starts_at=v_starts_at' in v_definition) = 0 then
    raise exception 'afishi022_materializer_venue_hotfix_target_missing' using errcode='55000';
  end if;

  v_definition := pg_catalog.replace(
    v_definition,
    'venue_id=v_venue_id,starts_at=v_starts_at',
    'venue_id=coalesce(v_venue_id,venue_id),starts_at=v_starts_at'
  );
  execute v_definition;
end
$hotfix$;

revoke all on function public.city_posters_materialize_candidate(jsonb,text,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.city_posters_materialize_candidate(jsonb,text,text,text,boolean)
  to service_role;
notify pgrst, 'reload schema';
commit;
