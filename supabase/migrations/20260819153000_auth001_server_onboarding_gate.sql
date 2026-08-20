-- AUTH001: server-side first-onboarding enforcement for protected product writes.
-- Repository patch only. Do not apply to production without separate approval.
-- Public/read-only surfaces, auth/account flows, and profile bootstrap remain intentionally ungated.

begin;

create or replace function go_irl_private.has_completed_first_onboarding(p_user_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_key is not null
    and exists (
      select 1
      from public.app_users app_user
      where app_user.user_key = p_user_key
        and app_user.status = 'active'
    )
    and exists (
      select 1
      from public.user_onboarding_activations activation
      join public.user_handles handle using (user_key)
      where activation.user_key = p_user_key
        and activation.is_18_or_older = true
        and handle.normalized_nickname = handle.nickname
    );
$$;

revoke all on function go_irl_private.has_completed_first_onboarding(text) from public;
revoke all on function go_irl_private.has_completed_first_onboarding(text) from anon;
revoke all on function go_irl_private.has_completed_first_onboarding(text) from authenticated;
grant execute on function go_irl_private.has_completed_first_onboarding(text) to authenticated;

-- Keep the predicate out of the exposed public API schema. RLS policies call the
-- private helper directly; ONB200 already grants authenticated USAGE on go_irl_private.
drop function if exists public.go_irl_has_completed_first_onboarding();

create or replace function go_irl_private.enforce_completed_first_onboarding_on_user_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_key text := public.go_irl_auth_user_key();
begin
  -- Service/background writes without a GO IRL user JWT are outside the onboarding gate.
  if v_user_key is null then
    return new;
  end if;

  if not go_irl_private.has_completed_first_onboarding(v_user_key) then
    raise exception 'first onboarding required' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function go_irl_private.enforce_completed_first_onboarding_on_user_write() from public;
revoke all on function go_irl_private.enforce_completed_first_onboarding_on_user_write() from anon;
revoke all on function go_irl_private.enforce_completed_first_onboarding_on_user_write() from authenticated;

-- Enforce at table boundaries so both direct PostgREST writes and SECURITY DEFINER RPCs
-- are covered. INSERT/UPDATE only: account/security cleanup and FK cascades must not be
-- deadlocked by onboarding state during deletion.
do $auth001$
declare
  v_table text;
begin
  foreach v_table in array array[
    'activities',
    'activity_members',
    'activity_chats',
    'activity_chat_messages',
    'activity_external_telegram_chats',
    'coach_profiles',
    'coach_requests',
    'coach_reviews',
    'event_reminders',
    'beauty_professional_profiles',
    'beauty_professional_services',
    'beauty_availability_rules',
    'beauty_time_blocks',
    'beauty_bookings',
    'beauty_booking_waitlist_entries',
    'beauty_share_cards'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists auth001_require_onboarding_write on public.%I', v_table);
      execute format(
        'create trigger auth001_require_onboarding_write before insert or update on public.%I for each row execute function go_irl_private.enforce_completed_first_onboarding_on_user_write()',
        v_table
      );
    end if;
  end loop;
end
$auth001$;

-- Direct DELETE paths remain RLS-gated while security-definer cleanup/cascades stay viable.
drop policy if exists "organizer or admin activities delete" on public.activities;
create policy "organizer or admin activities delete"
on public.activities for delete to authenticated using (
  go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key())
  and (
    organizer_key = public.go_irl_request_user_key()
    or private.go_irl_request_is_admin()
  )
);

drop policy if exists "public members delete" on public.activity_members;
create policy "public members delete"
on public.activity_members for delete to authenticated using (
  go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key())
  and (
    user_key = public.go_irl_request_user_key()
    or private.go_irl_request_can_moderate()
    or exists (
      select 1
      from public.activities
      where activities.id = activity_members.activity_id
        and activities.organizer_key = public.go_irl_request_user_key()
    )
  )
);

alter policy "event reminders own delete" on public.event_reminders
using (
  go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key())
  and user_key = public.go_irl_auth_user_key()
);

alter policy "external telegram chats delete organizer" on public.activity_external_telegram_chats
using (
  go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key())
  and public.go_irl_is_activity_organizer(activity_id)
);

alter policy "beauty share cards owner delete" on public.beauty_share_cards
using (
  go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key())
  and public.go_irl_owns_beauty_profile(profile_id)
);

-- Beauty share-card object mutations are direct Storage API writes and therefore need
-- an explicit server-side onboarding predicate as well.
drop policy if exists "beauty share objects owner insert" on storage.objects;
create policy "beauty share objects owner insert"
on storage.objects for insert to authenticated
with check (
  go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key())
  and bucket_id in ('beauty-share-assets', 'beauty-share-cards')
  and (storage.foldername(name))[1] = public.go_irl_auth_user_key()
  and public.go_irl_current_user_is_professional()
);

drop policy if exists "beauty share objects owner update" on storage.objects;
create policy "beauty share objects owner update"
on storage.objects for update to authenticated
using (
  go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key())
  and bucket_id in ('beauty-share-assets', 'beauty-share-cards')
  and (storage.foldername(name))[1] = public.go_irl_auth_user_key()
  and public.go_irl_current_user_is_professional()
)
with check (
  go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key())
  and bucket_id in ('beauty-share-assets', 'beauty-share-cards')
  and (storage.foldername(name))[1] = public.go_irl_auth_user_key()
  and public.go_irl_current_user_is_professional()
);

drop policy if exists "beauty share objects owner delete" on storage.objects;
create policy "beauty share objects owner delete"
on storage.objects for delete to authenticated
using (
  go_irl_private.has_completed_first_onboarding(public.go_irl_auth_user_key())
  and bucket_id in ('beauty-share-assets', 'beauty-share-cards')
  and (storage.foldername(name))[1] = public.go_irl_auth_user_key()
  and public.go_irl_current_user_is_professional()
);

notify pgrst, 'reload schema';

commit;
