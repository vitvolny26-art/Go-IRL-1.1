-- Rollback-only verifier for the canonical notification claim terminal-failure guard.

begin;
do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.go_irl_claim_event_notifications(text[],integer,integer)'::regprocedure
  ) into definition;

  if definition not like '%notification.status = ''failed''%'
    or definition not like '%notification.next_attempt_at is not null%'
    or definition not like '%notification.next_attempt_at <= now()%'
  then
    raise exception 'terminal failed notification guard missing';
  end if;

  if definition like '%notification.status in (''scheduled'', ''failed'')%'
  then
    raise exception 'legacy failed notification claim condition still present';
  end if;

  if definition not like '%notification.delivery_mode = ''legacy_single_route''%'
  then
    raise exception 'multi-leg isolation guard missing from canonical notification claim';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.go_irl_claim_event_notifications(text[],integer,integer)',
    'execute'
  ) then
    raise exception 'authenticated role can claim canonical notifications';
  end if;
end
$$;

rollback;
