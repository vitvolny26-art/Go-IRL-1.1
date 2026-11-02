\set ON_ERROR_STOP on

DO $assert$
DECLARE
  v_oid oid;
  v_owner text;
  v_definition_md5 text;
  v_acl text;
  v_security_definer boolean;
  v_config text[];
BEGIN
  SELECT p.oid,
         r.rolname,
         md5(pg_get_functiondef(p.oid)),
         coalesce(array_to_string(p.proacl, ','), 'NULL'),
         p.prosecdef,
         p.proconfig
    INTO STRICT v_oid, v_owner, v_definition_md5, v_acl, v_security_definer, v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles r ON r.oid = p.proowner
  WHERE n.nspname = 'public'
    AND p.proname = 'cinema_catalog_wednesday_write_v1'
    AND pg_get_function_identity_arguments(p.oid) =
        'p_city_id text, p_week_start date, p_week_end date, p_movies jsonb';

  IF v_definition_md5 <> '808bae5d2fb87dc1794e6846507990fa' THEN
    RAISE EXCEPTION 'rollback definition MD5 mismatch: %', v_definition_md5;
  END IF;
  IF v_owner <> 'postgres' THEN
    RAISE EXCEPTION 'unexpected owner: %', v_owner;
  END IF;
  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role lost EXECUTE';
  END IF;
  IF has_function_privilege('gate_untrusted', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'untrusted role unexpectedly has EXECUTE; ACL=%', v_acl;
  END IF;
  IF v_security_definer THEN
    RAISE EXCEPTION 'function must remain SECURITY INVOKER';
  END IF;
  IF array_position(v_config, 'search_path=pg_catalog, public') IS NULL THEN
    RAISE EXCEPTION 'unexpected search_path config: %', v_config;
  END IF;
END
$assert$;
