-- GROOMING018-J: governed superadmin Beauty cabinet lifecycle.
-- Source-only preparation. Production apply and production-data classification remain separate gates.

begin;

do $preflight$
begin
  if to_regclass('public.beauty_professional_profiles') is null
    or to_regclass('public.beauty_professional_services') is null
    or to_regclass('public.beauty_availability_rules') is null
    or to_regclass('public.beauty_workspace_ownership_transfers') is null
    or to_regclass('public.app_users') is null
    or to_regclass('public.user_roles') is null
    or to_regclass('public.audit_log') is null then
    raise exception 'GROOMING018-J requires the current Beauty/profile/transfer/auth/audit foundation';
  end if;

  if to_regprocedure('public.go_irl_beauty_i18n_sanitize(jsonb,integer)') is null
    or to_regprocedure('public.go_irl_beauty_i18n_pick(jsonb,text,text)') is null
    or to_regprocedure('public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz)') is null
    or to_regprocedure('public.go_irl_claim_beauty_workspace_owner_transfer(text,text)') is null
    or to_regprocedure('public.go_irl_get_beauty_workspace_owner_transfer_status(text,text)') is null
    or to_regprocedure('public.go_irl_list_pending_beauty_workspace_owner_transfers(text)') is null
    or to_regprocedure('public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text)') is null then
    raise exception 'GROOMING018-J requires the current Beauty owner-transfer RPC foundation';
  end if;
end
$preflight$;

-- Durable authority only. `handoff_pending` is derived from a live transfer row.
alter table public.beauty_professional_profiles
  add column if not exists management_state text not null default 'master_managed',
  add column if not exists management_updated_at timestamptz not null default now();

alter table public.beauty_professional_profiles
  drop constraint if exists beauty_professional_profiles_management_state_check;

alter table public.beauty_professional_profiles
  add constraint beauty_professional_profiles_management_state_check
  check (management_state in ('platform_managed', 'master_managed'));

comment on column public.beauty_professional_profiles.management_state is
  'Durable Beauty cabinet operating authority. handoff_pending is derived from a live platform_handoff transfer.';

comment on column public.beauty_professional_profiles.management_updated_at is
  'CAS revision for explicit Beauty cabinet management-authority changes.';

-- Extend the existing hash-only transfer table without changing legacy rows.
alter table public.beauty_workspace_ownership_transfers
  add column if not exists transfer_kind text not null default 'owner_transfer',
  add column if not exists initiated_by_superadmin_user_key text references public.app_users(user_key) on delete restrict;

alter table public.beauty_workspace_ownership_transfers
  drop constraint if exists beauty_workspace_owner_transfer_kind_check,
  drop constraint if exists beauty_workspace_owner_transfer_initiator_check;

alter table public.beauty_workspace_ownership_transfers
  add constraint beauty_workspace_owner_transfer_kind_check
    check (transfer_kind in ('owner_transfer', 'platform_handoff')),
  add constraint beauty_workspace_owner_transfer_initiator_check
    check (
      (transfer_kind = 'owner_transfer' and initiated_by_superadmin_user_key is null)
      or (transfer_kind = 'platform_handoff' and initiated_by_superadmin_user_key is not null)
    );

create index if not exists beauty_workspace_owner_transfer_kind_profile_idx
on public.beauty_workspace_ownership_transfers(transfer_kind, profile_id, state, expires_at);

comment on column public.beauty_workspace_ownership_transfers.transfer_kind is
  'owner_transfer keeps candidate->superadmin approval; platform_handoff is pre-authorized by exact superadmin and auto-approves on trusted Google claim.';

-- Internal exact-superadmin assertion. Service-role only.
create or replace function public.go_irl_beauty_assert_superadmin(p_user_key text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_user_key is null or not exists (
    select 1
    from public.app_users app_user
    join public.user_roles role on role.user_key = app_user.user_key
    where app_user.user_key = p_user_key
      and app_user.status = 'active'
      and role.role = 'superadmin'
  ) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.go_irl_beauty_assert_superadmin(text) from public, anon, authenticated;
grant execute on function public.go_irl_beauty_assert_superadmin(text) to service_role;

-- Aggregate revision used by superadmin CAS. Transfer state is intentionally excluded:
-- transfer lifecycle must not make an unrelated content edit stale.
create or replace function public.go_irl_beauty_workspace_revision(p_profile_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select greatest(
    profile.updated_at,
    coalesce((
      select max(service.updated_at)
      from public.beauty_professional_services service
      where service.profile_id = profile.id
        and service.archived = false
    ), profile.updated_at),
    coalesce((
      select max(rule.updated_at)
      from public.beauty_availability_rules rule
      where rule.profile_id = profile.id
    ), profile.updated_at)
  )
  from public.beauty_professional_profiles profile
  where profile.id = p_profile_id;
$$;

revoke all on function public.go_irl_beauty_workspace_revision(uuid) from public, anon, authenticated;
grant execute on function public.go_irl_beauty_workspace_revision(uuid) to service_role;

create or replace function public.go_irl_admin_list_beauty_workspaces(
  p_superadmin_user_key text
)
returns table(
  profile_id uuid,
  slug text,
  display_name text,
  city_id text,
  publication_state text,
  owner_user_key text,
  management_state text,
  lifecycle_state text,
  handoff_transfer_id uuid,
  handoff_expires_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.go_irl_beauty_assert_superadmin(p_superadmin_user_key);

  return query
  select
    profile.id,
    profile.slug,
    profile.display_name,
    profile.city_id,
    profile.publication_state,
    profile.owner_user_key,
    profile.management_state,
    case
      when profile.management_state = 'platform_managed' and handoff.id is not null then 'handoff_pending'::text
      else profile.management_state
    end,
    handoff.id,
    handoff.expires_at,
    public.go_irl_beauty_workspace_revision(profile.id)
  from public.beauty_professional_profiles profile
  left join lateral (
    select transfer.id, transfer.expires_at
    from public.beauty_workspace_ownership_transfers transfer
    where transfer.profile_id = profile.id
      and transfer.transfer_kind = 'platform_handoff'
      and transfer.state = 'pending_candidate'
      and transfer.revoked_at is null
      and transfer.expires_at > now()
    order by transfer.created_at desc
    limit 1
  ) handoff on true
  order by lower(profile.display_name), profile.id;
end;
$$;

revoke all on function public.go_irl_admin_list_beauty_workspaces(text) from public, anon, authenticated;
grant execute on function public.go_irl_admin_list_beauty_workspaces(text) to service_role;

create or replace function public.go_irl_admin_get_beauty_workspace(
  p_profile_id uuid,
  p_superadmin_user_key text
)
returns table(
  profile_id uuid,
  slug text,
  city_id text,
  display_name text,
  public_location text,
  contact text,
  exact_address text,
  publication_state text,
  description_i18n jsonb,
  instagram_url text,
  experience_i18n jsonb,
  specialization_i18n jsonb,
  hygiene_i18n jsonb,
  materials_i18n jsonb,
  spoken_languages_i18n jsonb,
  certificates_i18n jsonb,
  booking_notes_i18n jsonb,
  portfolio jsonb,
  services jsonb,
  availability jsonb,
  owner_user_key text,
  management_state text,
  lifecycle_state text,
  handoff_transfer_id uuid,
  handoff_expires_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.go_irl_beauty_assert_superadmin(p_superadmin_user_key);

  return query
  select
    profile.id,
    profile.slug,
    profile.city_id,
    profile.display_name,
    profile.public_location,
    profile.contact,
    profile.exact_address,
    profile.publication_state,
    profile.description_i18n,
    profile.instagram_url,
    profile.experience_i18n,
    profile.specialization_i18n,
    profile.hygiene_i18n,
    profile.materials_i18n,
    profile.spoken_languages_i18n,
    profile.certificates_i18n,
    profile.booking_notes_i18n,
    profile.portfolio,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', service.client_key,
          'database_id', service.id,
          'specialization', service.specialization,
          'name', service.service_name,
          'name_i18n', service.service_name_i18n,
          'duration_minutes', service.duration_minutes,
          'price_czk', service.price_czk,
          'buffer_minutes', service.buffer_minutes,
          'active', service.active,
          'sort_order', service.sort_order
        ) order by service.sort_order, service.created_at
      )
      from public.beauty_professional_services service
      where service.profile_id = profile.id
        and service.archived = false
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'weekday', rule.weekday,
          'start_time', rule.start_time::text,
          'end_time', rule.end_time::text,
          'timezone', rule.timezone,
          'slot_interval_minutes', rule.slot_interval_minutes,
          'active', rule.active
        ) order by rule.weekday, rule.start_time, rule.id
      )
      from public.beauty_availability_rules rule
      where rule.profile_id = profile.id
    ), '[]'::jsonb),
    profile.owner_user_key,
    profile.management_state,
    case
      when profile.management_state = 'platform_managed' and handoff.id is not null then 'handoff_pending'::text
      else profile.management_state
    end,
    handoff.id,
    handoff.expires_at,
    public.go_irl_beauty_workspace_revision(profile.id)
  from public.beauty_professional_profiles profile
  left join lateral (
    select transfer.id, transfer.expires_at
    from public.beauty_workspace_ownership_transfers transfer
    where transfer.profile_id = profile.id
      and transfer.transfer_kind = 'platform_handoff'
      and transfer.state = 'pending_candidate'
      and transfer.revoked_at is null
      and transfer.expires_at > now()
    order by transfer.created_at desc
    limit 1
  ) handoff on true
  where profile.id = p_profile_id;
end;
$$;

revoke all on function public.go_irl_admin_get_beauty_workspace(uuid,text) from public, anon, authenticated;
grant execute on function public.go_irl_admin_get_beauty_workspace(uuid,text) to service_role;

create or replace function public.go_irl_admin_save_beauty_workspace(
  p_profile_id uuid,
  p_workspace jsonb,
  p_expected_updated_at timestamptz,
  p_superadmin_user_key text
)
returns table(
  status text,
  profile_id uuid,
  slug text,
  publication_state text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.beauty_professional_profiles%rowtype;
  v_existing_updated_at timestamptz;
  v_services jsonb;
  v_portfolio_input jsonb;
  v_availability jsonb;
  v_portfolio jsonb := '[]'::jsonb;
  v_item jsonb;
  v_index integer;
  v_client_key text;
  v_name_i18n jsonb;
  v_service_name text;
  v_specialization text;
  v_duration integer;
  v_price integer;
  v_buffer integer;
  v_active boolean;
  v_active_count integer := 0;
  v_image_url text;
  v_instagram_url text;
  v_weekday integer;
  v_start time without time zone;
  v_end time without time zone;
  v_interval integer;
  v_availability_count integer := 0;
begin
  perform public.go_irl_beauty_assert_superadmin(p_superadmin_user_key);

  if p_profile_id is null or jsonb_typeof(coalesce(p_workspace, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid Beauty admin workspace payload' using errcode = '22023';
  end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::text, null::timestamptz;
    return;
  end if;

  v_existing_updated_at := public.go_irl_beauty_workspace_revision(v_profile.id);
  if p_expected_updated_at is null or p_expected_updated_at is distinct from v_existing_updated_at then
    return query select 'conflict'::text, v_profile.id, v_profile.slug, v_profile.publication_state, v_existing_updated_at;
    return;
  end if;

  if coalesce(p_workspace ->> 'publication_state', '') not in ('draft', 'published', 'hidden') then
    raise exception 'invalid Beauty publication state' using errcode = '22023';
  end if;

  v_services := coalesce(p_workspace -> 'services', '[]'::jsonb);
  v_portfolio_input := coalesce(p_workspace -> 'portfolio', '[]'::jsonb);
  v_availability := coalesce(p_workspace -> 'availability', '[]'::jsonb);

  if jsonb_typeof(v_services) <> 'array'
    or jsonb_typeof(v_portfolio_input) <> 'array'
    or jsonb_typeof(v_availability) <> 'array'
    or jsonb_typeof(coalesce(p_workspace -> 'description_i18n', '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_workspace -> 'experience_i18n', '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_workspace -> 'specialization_i18n', '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_workspace -> 'hygiene_i18n', '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_workspace -> 'materials_i18n', '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_workspace -> 'spoken_languages_i18n', '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_workspace -> 'certificates_i18n', '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_workspace -> 'booking_notes_i18n', '{}'::jsonb)) <> 'object' then
    raise exception 'Beauty admin content must use expected JSON object and array shapes' using errcode = '22023';
  end if;

  if jsonb_array_length(v_services) not between 1 and 50 then
    raise exception 'between 1 and 50 Beauty services are required' using errcode = '22023';
  end if;
  if jsonb_array_length(v_portfolio_input) > 24 then
    raise exception 'Beauty portfolio supports at most 24 items' using errcode = '22023';
  end if;
  if jsonb_array_length(v_availability) > 21 then
    raise exception 'Beauty availability supports at most 21 rows' using errcode = '22023';
  end if;

  v_instagram_url := left(btrim(coalesce(p_workspace ->> 'instagram_url', '')), 300);
  if v_instagram_url <> '' and v_instagram_url !~ '^https://(www\.)?instagram\.com/' then
    raise exception 'Instagram URL must use https://instagram.com/' using errcode = '22023';
  end if;

  for v_item, v_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(v_portfolio_input) with ordinality
  loop
    v_image_url := left(btrim(coalesce(v_item ->> 'image_url', '')), 1200);
    if v_image_url = '' then
      continue;
    end if;
    if v_image_url !~ '^https://'
      or jsonb_typeof(coalesce(v_item -> 'alt_i18n', '{}'::jsonb)) <> 'object' then
      raise exception 'Portfolio items require an HTTPS image URL and alt_i18n object' using errcode = '22023';
    end if;

    v_portfolio := v_portfolio || jsonb_build_array(jsonb_build_object(
      'id', left(regexp_replace(coalesce(v_item ->> 'id', 'work-' || v_index), '[^A-Za-z0-9._:-]+', '-', 'g'), 120),
      'image_url', v_image_url,
      'alt_i18n', public.go_irl_beauty_i18n_sanitize(v_item -> 'alt_i18n', 300),
      'sort_order', v_index
    ));
  end loop;

  update public.beauty_professional_profiles profile
  set display_name = btrim(coalesce(p_workspace ->> 'display_name', '')),
      public_location = btrim(coalesce(p_workspace ->> 'public_location', '')),
      contact = btrim(coalesce(p_workspace ->> 'contact', '')),
      exact_address = btrim(coalesce(p_workspace ->> 'exact_address', '')),
      publication_state = p_workspace ->> 'publication_state',
      description_i18n = public.go_irl_beauty_i18n_sanitize(p_workspace -> 'description_i18n', 1200),
      instagram_url = v_instagram_url,
      experience_i18n = public.go_irl_beauty_i18n_sanitize(p_workspace -> 'experience_i18n', 700),
      specialization_i18n = public.go_irl_beauty_i18n_sanitize(p_workspace -> 'specialization_i18n', 700),
      hygiene_i18n = public.go_irl_beauty_i18n_sanitize(p_workspace -> 'hygiene_i18n', 700),
      materials_i18n = public.go_irl_beauty_i18n_sanitize(p_workspace -> 'materials_i18n', 700),
      spoken_languages_i18n = public.go_irl_beauty_i18n_sanitize(p_workspace -> 'spoken_languages_i18n', 400),
      certificates_i18n = public.go_irl_beauty_i18n_sanitize(p_workspace -> 'certificates_i18n', 700),
      booking_notes_i18n = public.go_irl_beauty_i18n_sanitize(p_workspace -> 'booking_notes_i18n', 700),
      portfolio = v_portfolio,
      updated_at = now()
  where profile.id = v_profile.id;

  update public.beauty_professional_services service
  set active = false,
      archived = true,
      updated_at = now()
  where service.profile_id = v_profile.id;

  for v_item, v_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(v_services) with ordinality
  loop
    if jsonb_typeof(coalesce(v_item -> 'name_i18n', '{}'::jsonb)) <> 'object' then
      raise exception 'Service name_i18n must be a JSON object' using errcode = '22023';
    end if;

    v_client_key := left(regexp_replace(btrim(coalesce(v_item ->> 'id', 'service-' || v_index)), '[^A-Za-z0-9._:-]+', '-', 'g'), 120);
    if char_length(v_client_key) < 3 then v_client_key := 'service-' || v_index; end if;
    v_name_i18n := public.go_irl_beauty_i18n_sanitize(v_item -> 'name_i18n', 120);
    v_service_name := public.go_irl_beauty_i18n_pick(v_name_i18n, 'en', '');
    v_specialization := coalesce(nullif(btrim(v_item ->> 'specialization'), ''), 'nails');
    v_duration := coalesce((v_item ->> 'duration_minutes')::integer, 0);
    v_price := coalesce((v_item ->> 'price_czk')::integer, -1);
    v_buffer := coalesce((v_item ->> 'buffer_minutes')::integer, 0);
    v_active := coalesce((v_item ->> 'active')::boolean, true);

    if v_specialization not in ('nails', 'barber')
      or char_length(v_service_name) < 2
      or v_duration not between 5 and 480
      or v_price not between 0 and 100000
      or v_buffer not between 0 and 240 then
      raise exception 'Invalid Beauty service specialization, name, duration, price or buffer' using errcode = '22023';
    end if;

    if v_active then v_active_count := v_active_count + 1; end if;

    insert into public.beauty_professional_services (
      profile_id, client_key, specialization, service_name, service_name_i18n,
      duration_minutes, price_czk, buffer_minutes, currency, active, sort_order, archived
    ) values (
      v_profile.id, v_client_key, v_specialization, v_service_name, v_name_i18n,
      v_duration, v_price, v_buffer, 'CZK', v_active, v_index, false
    )
    on conflict (profile_id, client_key) do update
    set specialization = excluded.specialization,
        service_name = excluded.service_name,
        service_name_i18n = excluded.service_name_i18n,
        duration_minutes = excluded.duration_minutes,
        price_czk = excluded.price_czk,
        buffer_minutes = excluded.buffer_minutes,
        currency = 'CZK',
        active = excluded.active,
        sort_order = excluded.sort_order,
        archived = false,
        updated_at = now();
  end loop;

  if v_active_count < 1 then
    raise exception 'At least one active Beauty service is required' using errcode = '22023';
  end if;

  delete from public.beauty_availability_rules rule
  where rule.profile_id = v_profile.id;

  for v_item in
    select value from jsonb_array_elements(v_availability)
  loop
    v_weekday := (v_item ->> 'weekday')::integer;
    v_start := (v_item ->> 'start_time')::time;
    v_end := (v_item ->> 'end_time')::time;
    v_interval := coalesce((v_item ->> 'slot_interval_minutes')::integer, 30);

    if v_weekday not between 1 and 7
      or v_start >= v_end
      or v_interval not between 5 and 240 then
      raise exception 'invalid Beauty availability rule' using errcode = '22023';
    end if;

    insert into public.beauty_availability_rules (
      profile_id, weekday, start_time, end_time, timezone, slot_interval_minutes, active
    ) values (
      v_profile.id, v_weekday, v_start, v_end, 'Europe/Prague', v_interval, true
    );
    v_availability_count := v_availability_count + 1;
  end loop;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    p_superadmin_user_key,
    'beauty_workspace_admin.saved',
    'beauty_professional_profile',
    v_profile.id::text,
    jsonb_build_object(
      'publication_state', p_workspace ->> 'publication_state',
      'service_count', jsonb_array_length(v_services),
      'availability_count', v_availability_count,
      'previous_updated_at', v_existing_updated_at
    )
  );

  return query
  select
    'saved'::text,
    profile.id,
    profile.slug,
    profile.publication_state,
    public.go_irl_beauty_workspace_revision(profile.id)
  from public.beauty_professional_profiles profile
  where profile.id = v_profile.id;
end;
$$;

revoke all on function public.go_irl_admin_save_beauty_workspace(uuid,jsonb,timestamptz,text) from public, anon, authenticated;
grant execute on function public.go_irl_admin_save_beauty_workspace(uuid,jsonb,timestamptz,text) to service_role;

create or replace function public.go_irl_admin_adopt_beauty_workspace(
  p_profile_id uuid,
  p_expected_management_updated_at timestamptz,
  p_superadmin_user_key text
)
returns table(
  status text,
  profile_id uuid,
  management_state text,
  management_updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.beauty_professional_profiles%rowtype;
begin
  perform public.go_irl_beauty_assert_superadmin(p_superadmin_user_key);

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::timestamptz;
    return;
  end if;

  if p_expected_management_updated_at is null
    or p_expected_management_updated_at is distinct from v_profile.management_updated_at then
    return query select 'conflict'::text, v_profile.id, v_profile.management_state, v_profile.management_updated_at;
    return;
  end if;

  if exists (
    select 1
    from public.beauty_workspace_ownership_transfers transfer
    where transfer.profile_id = v_profile.id
      and transfer.state in ('pending_candidate', 'pending_superadmin')
      and transfer.revoked_at is null
      and transfer.expires_at > now()
  ) then
    return query select 'transfer_active'::text, v_profile.id, v_profile.management_state, v_profile.management_updated_at;
    return;
  end if;

  if v_profile.management_state = 'platform_managed' then
    return query select 'unchanged'::text, v_profile.id, v_profile.management_state, v_profile.management_updated_at;
    return;
  end if;

  update public.beauty_professional_profiles profile
  set management_state = 'platform_managed',
      management_updated_at = now()
  where profile.id = v_profile.id;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    p_superadmin_user_key,
    'beauty_workspace_management.adopted',
    'beauty_professional_profile',
    v_profile.id::text,
    jsonb_build_object('owner_user_key', v_profile.owner_user_key, 'previous_management_state', v_profile.management_state)
  );

  return query
  select 'adopted'::text, profile.id, profile.management_state, profile.management_updated_at
  from public.beauty_professional_profiles profile
  where profile.id = v_profile.id;
end;
$$;

revoke all on function public.go_irl_admin_adopt_beauty_workspace(uuid,timestamptz,text) from public, anon, authenticated;
grant execute on function public.go_irl_admin_adopt_beauty_workspace(uuid,timestamptz,text) to service_role;

create or replace function public.go_irl_prepare_beauty_platform_handoff(
  p_profile_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_superadmin_user_key text
)
returns table(status text, transfer_id uuid, profile_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_profile public.beauty_professional_profiles%rowtype;
  v_transfer public.beauty_workspace_ownership_transfers%rowtype;
begin
  perform public.go_irl_beauty_assert_superadmin(p_superadmin_user_key);

  if p_profile_id is null
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at is null
    or p_expires_at <= now()
    or p_expires_at > now() + interval '3 days' then
    return query select 'invalid'::text, null::uuid, p_profile_id, null::timestamptz;
    return;
  end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, p_profile_id, null::timestamptz;
    return;
  end if;

  if v_profile.management_state <> 'platform_managed' then
    return query select 'not_platform_managed'::text, null::uuid, v_profile.id, null::timestamptz;
    return;
  end if;

  update public.beauty_workspace_ownership_transfers transfer
  set revoked_at = now()
  where transfer.profile_id = v_profile.id
    and transfer.state in ('pending_candidate', 'pending_superadmin')
    and transfer.revoked_at is null;

  insert into public.beauty_workspace_ownership_transfers (
    profile_id,
    requested_by_user_key,
    token_hash,
    expires_at,
    transfer_kind,
    initiated_by_superadmin_user_key
  ) values (
    v_profile.id,
    v_profile.owner_user_key,
    p_token_hash,
    p_expires_at,
    'platform_handoff',
    p_superadmin_user_key
  ) returning * into v_transfer;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    p_superadmin_user_key,
    'beauty_workspace_platform_handoff.prepared',
    'beauty_workspace_ownership_transfer',
    v_transfer.id::text,
    jsonb_build_object(
      'profile_id', v_profile.id,
      'technical_owner_user_key', v_profile.owner_user_key,
      'expires_at', v_transfer.expires_at
    )
  );

  return query select 'prepared'::text, v_transfer.id, v_profile.id, v_transfer.expires_at;
end;
$$;

revoke all on function public.go_irl_prepare_beauty_platform_handoff(uuid,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.go_irl_prepare_beauty_platform_handoff(uuid,text,timestamptz,text) to service_role;

-- Legacy master-to-master request remains authenticated owner-driven, but a technical
-- owner of a platform-managed cabinet may no longer start that flow.
create or replace function public.go_irl_request_beauty_workspace_owner_transfer(
  p_token_hash text,
  p_expires_at timestamptz
)
returns table(status text, transfer_id uuid, profile_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_key text;
  v_profile public.beauty_professional_profiles%rowtype;
  v_transfer public.beauty_workspace_ownership_transfers%rowtype;
begin
  v_user_key := public.go_irl_auth_user_key();
  if v_user_key is null
    or not public.go_irl_current_user_is_professional()
    or p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at is null
    or p_expires_at <= now()
    or p_expires_at > now() + interval '3 days' then
    return query select 'invalid'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.owner_user_key = v_user_key
  for update;

  if not found then
    return query select 'profile_missing'::text, null::uuid, null::uuid, null::timestamptz;
    return;
  end if;

  if v_profile.management_state <> 'master_managed' then
    return query select 'platform_managed'::text, null::uuid, v_profile.id, null::timestamptz;
    return;
  end if;

  update public.beauty_workspace_ownership_transfers transfer
  set revoked_at = now()
  where transfer.profile_id = v_profile.id
    and transfer.state in ('pending_candidate', 'pending_superadmin')
    and transfer.revoked_at is null;

  insert into public.beauty_workspace_ownership_transfers (
    profile_id,
    requested_by_user_key,
    token_hash,
    expires_at,
    transfer_kind,
    initiated_by_superadmin_user_key
  ) values (
    v_profile.id,
    v_user_key,
    p_token_hash,
    p_expires_at,
    'owner_transfer',
    null
  ) returning * into v_transfer;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    v_user_key,
    'beauty_workspace_ownership_transfer.requested',
    'beauty_workspace_ownership_transfer',
    v_transfer.id::text,
    jsonb_build_object('profile_id', v_profile.id, 'expires_at', v_transfer.expires_at)
  );

  return query select 'prepared'::text, v_transfer.id, v_profile.id, v_transfer.expires_at;
end;
$$;

revoke all on function public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz) from public, anon;
grant execute on function public.go_irl_request_beauty_workspace_owner_transfer(text,timestamptz) to authenticated;

-- Shared Google claim endpoint. platform_handoff is already superadmin-authorized,
-- so it atomically approves; owner_transfer keeps the historical approval gate.
create or replace function public.go_irl_claim_beauty_workspace_owner_transfer(
  p_token_hash text,
  p_candidate_user_key text
)
returns table(status text, transfer_id uuid, profile_id uuid, current_owner_user_key text, candidate_user_key text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transfer public.beauty_workspace_ownership_transfers%rowtype;
  v_profile public.beauty_professional_profiles%rowtype;
  v_candidate_role text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_candidate_user_key is null then
    return query select 'invalid'::text, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  select transfer.* into v_transfer
  from public.beauty_workspace_ownership_transfers transfer
  where transfer.token_hash = p_token_hash
  for update;

  if not found then
    return query select 'invalid'::text, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  if v_transfer.revoked_at is not null or v_transfer.expires_at <= now() then
    return query select 'expired_or_revoked'::text, v_transfer.id, v_transfer.profile_id, v_transfer.requested_by_user_key, null::text;
    return;
  end if;

  if v_transfer.state in ('approved', 'rejected') then
    if v_transfer.candidate_user_key = p_candidate_user_key then
      return query select v_transfer.state, v_transfer.id, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.candidate_user_key;
    end if;
    return query select 'invalid'::text, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  if v_transfer.state = 'pending_superadmin' then
    if v_transfer.transfer_kind = 'owner_transfer' and v_transfer.candidate_user_key = p_candidate_user_key then
      return query select 'already_claimed'::text, v_transfer.id, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.candidate_user_key;
    end if;
    return query select 'invalid'::text, null::uuid, null::uuid, null::text, null::text;
    return;
  end if;

  if v_transfer.state <> 'pending_candidate' then
    return query select v_transfer.state, v_transfer.id, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.candidate_user_key;
    return;
  end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = v_transfer.profile_id
  for update;

  if not found or v_profile.owner_user_key <> v_transfer.requested_by_user_key then
    return query select 'owner_changed'::text, v_transfer.id, v_transfer.profile_id, v_transfer.requested_by_user_key, null::text;
    return;
  end if;

  if p_candidate_user_key = v_profile.owner_user_key then
    return query select 'same_owner'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
    return;
  end if;

  if not exists (
    select 1 from public.app_users app_user
    where app_user.user_key = p_candidate_user_key and app_user.status = 'active'
  ) then
    return query select 'candidate_unavailable'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
    return;
  end if;

  if exists (
    select 1 from public.beauty_professional_profiles profile
    where profile.owner_user_key = p_candidate_user_key
      and profile.id <> v_transfer.profile_id
  ) then
    return query select 'profile_conflict'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
    return;
  end if;

  select role into v_candidate_role
  from public.user_roles
  where user_key = p_candidate_user_key
  for update;

  if v_candidate_role is not null and v_candidate_role not in ('user', 'professional') then
    return query select 'role_conflict'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
    return;
  end if;

  if v_transfer.transfer_kind = 'platform_handoff' then
    if v_profile.management_state <> 'platform_managed'
      or v_transfer.initiated_by_superadmin_user_key is null then
      return query select 'management_state_changed'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
      return;
    end if;

    if v_candidate_role is null then
      insert into public.user_roles(user_key, role, note)
      values (p_candidate_user_key, 'professional', 'Assigned through GO IRL Beauty platform handoff');
    elsif v_candidate_role = 'user' then
      update public.user_roles
      set role = 'professional',
          note = 'Assigned through GO IRL Beauty platform handoff',
          updated_at = now()
      where user_key = p_candidate_user_key;
    end if;

    update public.beauty_professional_profiles profile
    set owner_user_key = p_candidate_user_key,
        management_state = 'master_managed',
        management_updated_at = now(),
        updated_at = now()
    where profile.id = v_transfer.profile_id
      and profile.owner_user_key = v_transfer.requested_by_user_key
      and profile.management_state = 'platform_managed';

    if not found then
      raise exception 'ownership_conflict' using errcode = '40001';
    end if;

    update public.beauty_workspace_ownership_transfers transfer
    set state = 'approved',
        candidate_user_key = p_candidate_user_key,
        candidate_claimed_at = now(),
        decided_at = now(),
        decided_by_user_key = v_transfer.initiated_by_superadmin_user_key
    where transfer.id = v_transfer.id;

    insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
    values (
      v_transfer.initiated_by_superadmin_user_key,
      'beauty_workspace_platform_handoff.approved',
      'beauty_workspace_ownership_transfer',
      v_transfer.id::text,
      jsonb_build_object(
        'profile_id', v_transfer.profile_id,
        'previous_owner_user_key', v_transfer.requested_by_user_key,
        'current_owner_user_key', p_candidate_user_key,
        'candidate_google_claimed', true
      )
    );

    return query select 'approved'::text, v_transfer.id, v_transfer.profile_id, v_transfer.requested_by_user_key, p_candidate_user_key;
    return;
  end if;

  update public.beauty_workspace_ownership_transfers transfer
  set state = 'pending_superadmin',
      candidate_user_key = p_candidate_user_key,
      candidate_claimed_at = now()
  where transfer.id = v_transfer.id;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    p_candidate_user_key,
    'beauty_workspace_ownership_transfer.candidate_claimed',
    'beauty_workspace_ownership_transfer',
    v_transfer.id::text,
    jsonb_build_object('profile_id', v_transfer.profile_id, 'current_owner_user_key', v_profile.owner_user_key)
  );

  return query select 'pending_superadmin'::text, v_transfer.id, v_transfer.profile_id, v_profile.owner_user_key, p_candidate_user_key;
end;
$$;

revoke all on function public.go_irl_claim_beauty_workspace_owner_transfer(text,text) from public, anon, authenticated;
grant execute on function public.go_irl_claim_beauty_workspace_owner_transfer(text,text) to service_role;

-- Explicit superadmin decision remains legacy owner-transfer only.
create or replace function public.go_irl_decide_beauty_workspace_owner_transfer(
  p_transfer_id uuid,
  p_decision text,
  p_superadmin_user_key text
)
returns table(status text, profile_id uuid, previous_owner_user_key text, current_owner_user_key text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transfer public.beauty_workspace_ownership_transfers%rowtype;
  v_profile public.beauty_professional_profiles%rowtype;
  v_candidate_role text;
begin
  if p_decision not in ('approve', 'reject') then
    return query select 'invalid_decision'::text, null::uuid, null::text, null::text;
    return;
  end if;

  perform public.go_irl_beauty_assert_superadmin(p_superadmin_user_key);

  select transfer.* into v_transfer
  from public.beauty_workspace_ownership_transfers transfer
  where transfer.id = p_transfer_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if v_transfer.transfer_kind <> 'owner_transfer' then
    return query select 'not_decidable'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  if v_transfer.state in ('approved', 'rejected') then
    return query select v_transfer.state, v_transfer.profile_id, v_transfer.requested_by_user_key,
      case when v_transfer.state = 'approved' then v_transfer.candidate_user_key else v_transfer.requested_by_user_key end;
    return;
  end if;

  if v_transfer.state <> 'pending_superadmin'
    or v_transfer.candidate_user_key is null
    or v_transfer.revoked_at is not null
    or v_transfer.expires_at <= now() then
    return query select 'not_decidable'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  select profile.* into v_profile
  from public.beauty_professional_profiles profile
  where profile.id = v_transfer.profile_id
  for update;

  if not found or v_profile.owner_user_key <> v_transfer.requested_by_user_key then
    return query select 'owner_changed'::text, v_transfer.profile_id, v_transfer.requested_by_user_key,
      case when found then v_profile.owner_user_key else null end;
    return;
  end if;

  if p_decision = 'reject' then
    update public.beauty_workspace_ownership_transfers transfer
    set state = 'rejected',
        decided_at = now(),
        decided_by_user_key = p_superadmin_user_key
    where transfer.id = v_transfer.id;

    insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
    values (
      p_superadmin_user_key,
      'beauty_workspace_ownership_transfer.rejected',
      'beauty_workspace_ownership_transfer',
      v_transfer.id::text,
      jsonb_build_object(
        'profile_id', v_transfer.profile_id,
        'previous_owner_user_key', v_transfer.requested_by_user_key,
        'candidate_user_key', v_transfer.candidate_user_key
      )
    );

    return query select 'rejected'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  if not exists (
    select 1 from public.app_users app_user
    where app_user.user_key = v_transfer.candidate_user_key and app_user.status = 'active'
  ) then
    return query select 'candidate_unavailable'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  if exists (
    select 1 from public.beauty_professional_profiles profile
    where profile.owner_user_key = v_transfer.candidate_user_key
      and profile.id <> v_transfer.profile_id
  ) then
    return query select 'profile_conflict'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  select role into v_candidate_role
  from public.user_roles
  where user_key = v_transfer.candidate_user_key
  for update;

  if v_candidate_role is null then
    insert into public.user_roles(user_key, role, note)
    values (v_transfer.candidate_user_key, 'professional', 'Assigned through approved Beauty workspace ownership transfer');
  elsif v_candidate_role = 'user' then
    update public.user_roles
    set role = 'professional',
        note = 'Assigned through approved Beauty workspace ownership transfer',
        updated_at = now()
    where user_key = v_transfer.candidate_user_key;
  elsif v_candidate_role <> 'professional' then
    return query select 'role_conflict'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.requested_by_user_key;
    return;
  end if;

  update public.beauty_professional_profiles profile
  set owner_user_key = v_transfer.candidate_user_key,
      management_state = 'master_managed',
      management_updated_at = now(),
      updated_at = now()
  where profile.id = v_transfer.profile_id
    and profile.owner_user_key = v_transfer.requested_by_user_key;

  if not found then
    raise exception 'ownership_conflict' using errcode = '40001';
  end if;

  update public.beauty_workspace_ownership_transfers transfer
  set state = 'approved',
      decided_at = now(),
      decided_by_user_key = p_superadmin_user_key
  where transfer.id = v_transfer.id;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    p_superadmin_user_key,
    'beauty_workspace_ownership_transfer.approved',
    'beauty_workspace_ownership_transfer',
    v_transfer.id::text,
    jsonb_build_object(
      'profile_id', v_transfer.profile_id,
      'previous_owner_user_key', v_transfer.requested_by_user_key,
      'current_owner_user_key', v_transfer.candidate_user_key
    )
  );

  return query select 'approved'::text, v_transfer.profile_id, v_transfer.requested_by_user_key, v_transfer.candidate_user_key;
end;
$$;

revoke all on function public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text) from public, anon, authenticated;
grant execute on function public.go_irl_decide_beauty_workspace_owner_transfer(uuid,text,text) to service_role;

notify pgrst, 'reload schema';

commit;
