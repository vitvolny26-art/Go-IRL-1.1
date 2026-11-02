#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

function_identity="public.cinema_catalog_wednesday_write_v1(text,date,date,jsonb)"

psql_base=(psql -X --set=ON_ERROR_STOP=1 --no-psqlrc)

server_version="$("${psql_base[@]}" -Atc "show server_version_num")"
if [[ ! "$server_version" =~ ^18[0-9]{4}$ ]]; then
  echo "Expected PostgreSQL 18.x, got server_version_num=$server_version" >&2
  exit 1
fi

"${psql_base[@]}" -f sql/bootstrap.sql

apply_as_postgres() {
  local sql_file="$1"
  "${psql_base[@]}" -f "$sql_file"
}

definition_md5() {
  "${psql_base[@]}" -Atc "select md5(pg_get_functiondef('$function_identity'::regprocedure));"
}

metadata_snapshot() {
  "${psql_base[@]}" -Atc "
    select md5(pg_get_functiondef(p.oid))
      || '|' || r.rolname
      || '|' || coalesce(array_to_string(p.proacl, ','), 'NULL')
      || '|' || p.prosecdef::text
      || '|' || coalesce(array_to_string(p.proconfig, ','), 'NULL')
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    join pg_roles r on r.oid=p.proowner
    where n.nspname='public'
      and p.proname='cinema_catalog_wednesday_write_v1'
      and pg_get_function_identity_arguments(p.oid)=
          'p_city_id text, p_week_start date, p_week_end date, p_movies jsonb';"
}

apply_as_postgres sql/prod_rollback.sql
"${psql_base[@]}" -c "GRANT EXECUTE ON FUNCTION public.cinema_catalog_wednesday_write_v1(text,date,date,jsonb) TO service_role;"
"${psql_base[@]}" -f sql/assert_rollback.sql
baseline_md5="$(definition_md5)"

apply_as_postgres sql/candidate_b030454.sql
candidate_md5="$(definition_md5)"
if [[ "$candidate_md5" == "$baseline_md5" ]]; then
  echo "Candidate did not change the function definition" >&2
  exit 1
fi

apply_as_postgres sql/prod_rollback.sql
"${psql_base[@]}" -f sql/assert_rollback.sql
first_snapshot="$(metadata_snapshot)"

apply_as_postgres sql/prod_rollback.sql
apply_as_postgres sql/prod_rollback.sql
"${psql_base[@]}" -f sql/assert_rollback.sql
second_snapshot="$(metadata_snapshot)"

if [[ "$first_snapshot" != "$second_snapshot" ]]; then
  echo "Rollback is not metadata-idempotent" >&2
  echo "first=$first_snapshot" >&2
  echo "second=$second_snapshot" >&2
  exit 1
fi

echo "PostgreSQL 18 rollback gate passed"
echo "candidate_definition_md5=$candidate_md5"
echo "restored_definition_md5=$baseline_md5"
echo "restored_metadata=$second_snapshot"
