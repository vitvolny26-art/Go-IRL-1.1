begin;

alter table public.user_provider_identities
  add column if not exists provider_username text,
  add column if not exists provider_email text,
  add column if not exists provider_display_name text;

comment on column public.user_provider_identities.provider_username is
  'Display-only provider username. Never used for authorization or account matching.';
comment on column public.user_provider_identities.provider_email is
  'Display-only email observed from a verified provider session. Never used for authorization or automatic account matching.';
comment on column public.user_provider_identities.provider_display_name is
  'Display-only provider account name. Never used for authorization or account matching.';

update public.user_provider_identities as identity
set
  provider_username = nullif(lower(btrim(app_user.username)), ''),
  provider_display_name = nullif(btrim(concat_ws(' ', app_user.first_name, app_user.last_name)), ''),
  updated_at = now()
from public.app_users as app_user
where identity.user_key = app_user.user_key
  and identity.provider = 'telegram'
  and (
    identity.provider_username is distinct from nullif(lower(btrim(app_user.username)), '')
    or identity.provider_display_name is distinct from nullif(btrim(concat_ws(' ', app_user.first_name, app_user.last_name)), '')
  );

commit;
