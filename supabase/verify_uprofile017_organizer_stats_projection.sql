do $verify$
declare
  v_oid oid := to_regprocedure('public.go_irl_get_organizer_stats(text)');
  v_security_definer boolean;
  v_volatility "char";
  v_config text[];
  v_definition text;
  v_average numeric;
  v_rating_count bigint;
  v_completed_count bigint;
begin
  if v_oid is null then
    raise exception 'uprofile017_verify_missing_organizer_stats_rpc';
  end if;

  select prosecdef, provolatile, proconfig, pg_get_functiondef(oid)
    into v_security_definer, v_volatility, v_config, v_definition
  from pg_proc
  where oid = v_oid;

  if not v_security_definer then
    raise exception 'uprofile017_verify_rpc_not_security_definer';
  end if;
  if v_volatility <> 's' then
    raise exception 'uprofile017_verify_rpc_not_stable';
  end if;
  if not ('search_path=' = any(coalesce(v_config, array[]::text[]))) then
    raise exception 'uprofile017_verify_rpc_search_path_not_empty';
  end if;

  if has_function_privilege('anon', v_oid, 'execute') then
    raise exception 'uprofile017_verify_anon_execute_must_be_revoked';
  end if;
  if not has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception 'uprofile017_verify_authenticated_execute_missing';
  end if;
  if not has_function_privilege('service_role', v_oid, 'execute') then
    raise exception 'uprofile017_verify_service_role_execute_missing';
  end if;

  if position('avg(feedback.organizer_rating::numeric)' in lower(v_definition)) = 0
     or position("feedback.eligibility_state = 'eligible'" in lower(v_definition)) = 0
     or position("feedback.resolution = 'attended'" in lower(v_definition)) = 0
     or position("outcome.event_resolution = 'confirmed_happened'" in lower(v_definition)) = 0
     or position('count(distinct outcome.activity_id)' in lower(v_definition)) = 0 then
    raise exception 'uprofile017_verify_projection_predicates_missing';
  end if;

  select average_rating, rating_count, completed_activity_count
    into v_average, v_rating_count, v_completed_count
  from public.go_irl_get_organizer_stats('__uprofile017_nonexistent_organizer__');

  if v_average is not null or v_rating_count <> 0 or v_completed_count <> 0 then
    raise exception 'uprofile017_verify_zero_state_invalid';
  end if;
end;
$verify$;
