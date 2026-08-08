begin;

alter table public.app_users
  add constraint app_users_auth_provider_check_v3
  check (auth_provider = any (array[
    'telegram'::text,
    'whatsapp'::text,
    'instagram'::text,
    'messenger'::text,
    'google'::text,
    'facebook'::text
  ])) not valid;
alter table public.app_users validate constraint app_users_auth_provider_check_v3;
alter table public.app_users drop constraint app_users_auth_provider_check;
alter table public.app_users rename constraint app_users_auth_provider_check_v3 to app_users_auth_provider_check;

alter table public.user_provider_identities
  add constraint user_provider_identities_provider_check_v3
  check (provider = any (array[
    'telegram'::text,
    'whatsapp'::text,
    'instagram'::text,
    'messenger'::text,
    'google'::text,
    'facebook'::text
  ])) not valid;
alter table public.user_provider_identities validate constraint user_provider_identities_provider_check_v3;
alter table public.user_provider_identities drop constraint user_provider_identities_provider_check;
alter table public.user_provider_identities rename constraint user_provider_identities_provider_check_v3 to user_provider_identities_provider_check;

notify pgrst, 'reload schema';
commit;
