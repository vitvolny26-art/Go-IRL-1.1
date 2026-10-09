begin;

do $hotfix$
declare
  v_oid oid;
  v_definition text;
begin
  select p.oid
  into v_oid
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'city_posters_materialize_candidate'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_candidate jsonb, p_city_id text, p_language text, p_timezone text, p_dry_run boolean';

  if v_oid is null then
    raise exception 'afishi022_materializer_missing_for_hotfix' using errcode = '55000';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  v_definition := pg_catalog.replace(v_definition, 'pg_catalog.coalesce(', 'coalesce(');
  v_definition := pg_catalog.replace(v_definition, 'pg_catalog.greatest(', 'greatest(');

  if v_definition like '%pg_catalog.coalesce(%'
     or v_definition like '%pg_catalog.greatest(%' then
    raise exception 'afishi022_materializer_hotfix_incomplete' using errcode = '55000';
  end if;

  execute v_definition;
end
$hotfix$;

revoke all on function public.city_posters_materialize_candidate(jsonb,text,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.city_posters_materialize_candidate(jsonb,text,text,text,boolean)
  to service_role;

notify pgrst, 'reload schema';
commit;
