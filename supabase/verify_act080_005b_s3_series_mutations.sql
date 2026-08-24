-- ACT080-005B-S3 rollback-only structural verifier.

begin;

do $$
declare
  v_update regprocedure := to_regprocedure('public.go_irl_update_activity_series_occurrences(uuid,text,text,text,text,text,date,time without time zone,text,text,text,text,text,jsonb,integer,integer,text)');
  v_cancel regprocedure := to_regprocedure('public.go_irl_cancel_activity_series_occurrences(uuid,text)');
  v_update_def text;
  v_cancel_def text;
begin
  if v_update is null then
    raise exception 'missing go_irl_update_activity_series_occurrences';
  end if;
  if v_cancel is null then
    raise exception 'missing go_irl_cancel_activity_series_occurrences';
  end if;

  select pg_get_functiondef(v_update::oid) into v_update_def;
  select pg_get_functiondef(v_cancel::oid) into v_cancel_def;

  if position('series_id = null' in lower(v_update_def)) = 0
    or position('series_occurrence_no = null' in lower(v_update_def)) = 0
    or position('activity.series_occurrence_no >= v_target.series_occurrence_no' in lower(v_update_def)) = 0 then
    raise exception 'series update scope contract missing';
  end if;

  if position('go_irl_activity_chat_expires_at' in lower(v_update_def)) = 0
    or position('topic_delete_after' in lower(v_update_def)) = 0 then
    raise exception 'series update chat lifecycle contract missing';
  end if;

  if position('event_cancelled' in lower(v_cancel_def)) = 0
    or position('event_reminders' in lower(v_cancel_def)) = 0
    or position('status = ''archived''' in lower(v_cancel_def)) = 0
    or position('topic_delete_after' in lower(v_cancel_def)) = 0
    or position('series_occurrence_status = ''cancelled''' in lower(v_cancel_def)) = 0 then
    raise exception 'series cancellation lifecycle contract missing';
  end if;

  if has_function_privilege('anon', v_update, 'EXECUTE')
    or has_function_privilege('anon', v_cancel, 'EXECUTE') then
    raise exception 'anon must not execute series mutation RPCs';
  end if;

  if not has_function_privilege('authenticated', v_update, 'EXECUTE')
    or not has_function_privilege('authenticated', v_cancel, 'EXECUTE') then
    raise exception 'authenticated must execute series mutation RPCs';
  end if;
end
$$;
rollback;
