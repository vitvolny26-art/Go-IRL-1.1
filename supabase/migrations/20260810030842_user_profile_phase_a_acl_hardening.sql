-- GO IRL TEST-verified profile ACL hardening.
-- Persisted from TEST migration history 20260810030842. Production apply requires separate approval.

revoke all on table public.user_profiles from authenticated;
revoke all on table public.user_profile_interests from authenticated;

grant select, insert, update on table public.user_profiles to authenticated;
grant select, insert, delete on table public.user_profile_interests to authenticated;

notify pgrst, 'reload schema';
