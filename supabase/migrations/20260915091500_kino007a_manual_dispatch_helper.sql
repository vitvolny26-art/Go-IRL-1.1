begin;

create or replace function public.go_irl_dispatch_cinema_publication_approval(
  p_approval_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pending_count integer;
  v_secret_count integer;
  v_worker_secret text;
  v_request_id bigint;
begin
  if p_approval_id is null then
    raise exception 'cinema_publication_approval_id_required';
  end if;

  lock table public.cinema_publication_approvals in share row exclusive mode;

  select count(*)
  into v_pending_count
  from public.cinema_publication_approvals approval
  where approval.status = 'pending';

  if v_pending_count <> 1 then
    raise exception 'cinema_publication_pending_count_mismatch';
  end if;

  if not exists (
    select 1
    from public.cinema_publication_approvals approval
    where approval.id = p_approval_id
      and approval.status = 'pending'
  ) then
    raise exception 'cinema_publication_approval_not_pending';
  end if;

  select count(*), min(secret.decrypted_secret)
  into v_secret_count, v_worker_secret
  from vault.decrypted_secrets secret
  where secret.name = 'go_irl_reminder_worker_secret'
    and length(secret.decrypted_secret) >= 32;

  if v_secret_count <> 1 or v_worker_secret is null then
    raise exception 'reminder_worker_secret_missing_or_ambiguous';
  end if;

  select net.http_post(
    url := 'https://go-irl-1-1.vercel.app/api/cinema/approval/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_worker_secret
    ),
    body := jsonb_build_object('force', true, 'limit', 1),
    timeout_milliseconds := 10000
  )
  into v_request_id;

  if v_request_id is null then
    raise exception 'cinema_publication_dispatch_request_not_created';
  end if;

  return v_request_id;
end;
$function$;

revoke all on function public.go_irl_dispatch_cinema_publication_approval(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.go_irl_dispatch_cinema_publication_approval(uuid)
  to service_role;

comment on function public.go_irl_dispatch_cinema_publication_approval(uuid) is
  'Kino007A bounded manual dispatcher. Requires exactly one pending approval, keeps the worker secret inside Vault, and only invokes the fixed production approval-run endpoint.';

notify pgrst, 'reload schema';

commit;
