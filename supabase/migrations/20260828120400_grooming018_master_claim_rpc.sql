-- GROOMING018: split from the approved local onboarding migration for connector-safe commit transport.
begin;

create or replace function public.go_irl_claim_beauty_master_onboarding(
  p_token_hash text,
  p_user_key text
)
returns table(status text, request_id text, profile_id uuid, slug text, assigned_role text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.beauty_master_onboarding_claims%rowtype;
  v_payload jsonb;
  v_current_role text;
  v_profile public.beauty_professional_profiles%rowtype;
  v_item jsonb;
  v_index integer;
  v_client_key text;
  v_service_name text;
  v_specialization text;
  v_active_count integer := 0;
  v_portfolio jsonb;
  v_day text;
  v_weekday smallint;
  v_start time;
  v_end time;
  v_break_start time;
  v_break_end time;
  v_break_enabled boolean;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_user_key is null then
    return query select 'invalid'::text, null::text, null::uuid, null::text, null::text;
    return;
  end if;

  if not exists (
    select 1 from public.app_users app_user
    where app_user.user_key = p_user_key and app_user.status = 'active'
  ) then
    return query select 'user_unavailable'::text, null::text, null::uuid, null::text, null::text;
    return;
  end if;

  select claim.* into v_claim
  from public.beauty_master_onboarding_claims claim
  where claim.token_hash = p_token_hash
  for update;

  if not found then
    return query select 'invalid'::text, null::text, null::uuid, null::text, null::text;
    return;
  end if;
  if v_claim.claimed_at is not null then
    if v_claim.claimed_by_user_key = p_user_key then
      return query select 'already_claimed'::text, v_claim.request_id, v_claim.claimed_profile_id, null::text, 'professional'::text;
    else
      return query select 'invalid'::text, null::text, null::uuid, null::text, null::text;
    end if;
    return;
  end if;
  if v_claim.revoked_at is not null or v_claim.expires_at <= now() then
    return query select 'expired_or_revoked'::text, v_claim.request_id, null::uuid, null::text, null::text;
    return;
  end if;

  if exists (select 1 from public.beauty_professional_profiles where owner_user_key = p_user_key) then
    return query select 'profile_conflict'::text, v_claim.request_id, null::uuid, null::text, null::text;
    return;
  end if;

  select role into v_current_role from public.user_roles where user_key = p_user_key for update;
  if v_current_role is null then
    insert into public.user_roles(user_key, role, note)
    values (p_user_key, 'professional', 'Assigned through GROOMING018 approved Beauty onboarding');
  elsif v_current_role = 'user' then
    update public.user_roles
    set role = 'professional', note = 'Assigned through GROOMING018 approved Beauty onboarding', updated_at = now()
    where user_key = p_user_key;
  elsif v_current_role <> 'professional' then
    return query select 'role_conflict'::text, v_claim.request_id, null::uuid, null::text, v_current_role;
    return;
  end if;

  v_payload := v_claim.approved_payload;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', left(regexp_replace(coalesce(item ->> 'id', 'work-' || (ordinality - 1)), '[^A-Za-z0-9._:-]+', '-', 'g'), 120),
      'image_url', left(btrim(coalesce(item ->> 'imageUrl', '')), 1200),
      'alt_i18n', public.go_irl_beauty_i18n_sanitize(item -> 'altByLanguage', 300),
      'sort_order', ordinality - 1
    ) order by ordinality
  ), '[]'::jsonb)
  into v_portfolio
  from jsonb_array_elements(coalesce(v_payload -> 'portfolio', '[]'::jsonb)) with ordinality as source(item, ordinality);

  insert into public.beauty_professional_profiles (
    owner_user_key, slug, city_id, display_name, public_location, contact, exact_address,
    publication_state, description_i18n, instagram_url, experience_i18n, specialization_i18n,
    hygiene_i18n, materials_i18n, spoken_languages_i18n, certificates_i18n,
    booking_notes_i18n, portfolio
  ) values (
    p_user_key,
    'beauty-' || substring(encode(digest(p_user_key, 'sha256'), 'hex') from 1 for 16),
    v_payload ->> 'cityId',
    btrim(v_payload ->> 'displayName'),
    btrim(v_payload ->> 'publicLocation'),
    btrim(v_payload ->> 'contact'),
    btrim(v_payload ->> 'exactAddress'),
    'draft',
    public.go_irl_beauty_i18n_sanitize(v_payload #> '{profile,descriptionByLanguage}', 1200),
    left(btrim(coalesce(v_payload ->> 'instagramUrl', '')), 300),
    public.go_irl_beauty_i18n_sanitize(v_payload #> '{profile,experienceByLanguage}', 700),
    public.go_irl_beauty_i18n_sanitize(v_payload #> '{profile,specializationByLanguage}', 700),
    public.go_irl_beauty_i18n_sanitize(v_payload #> '{profile,hygieneByLanguage}', 700),
    public.go_irl_beauty_i18n_sanitize(v_payload #> '{profile,materialsByLanguage}', 700),
    public.go_irl_beauty_i18n_sanitize(v_payload #> '{profile,spokenLanguagesByLanguage}', 400),
    public.go_irl_beauty_i18n_sanitize(v_payload #> '{profile,certificatesByLanguage}', 700),
    public.go_irl_beauty_i18n_sanitize(v_payload #> '{profile,bookingNotesByLanguage}', 700),
    v_portfolio
  ) returning * into v_profile;

  for v_item, v_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(v_payload -> 'services') with ordinality
  loop
    v_client_key := left(regexp_replace(btrim(coalesce(v_item ->> 'id', 'service-' || v_index)), '[^A-Za-z0-9._:-]+', '-', 'g'), 120);
    if char_length(v_client_key) < 3 then v_client_key := 'service-' || v_index; end if;
    v_specialization := coalesce(nullif(btrim(v_item ->> 'specialization'), ''), v_payload ->> 'profession');
    v_service_name := public.go_irl_beauty_i18n_pick(v_item -> 'nameByLanguage', 'en', '');

    insert into public.beauty_professional_services (
      profile_id, client_key, specialization, service_name, service_name_i18n,
      duration_minutes, price_czk, buffer_minutes, currency, active, sort_order, archived
    ) values (
      v_profile.id,
      v_client_key,
      v_specialization,
      v_service_name,
      public.go_irl_beauty_i18n_sanitize(v_item -> 'nameByLanguage', 120),
      (v_item ->> 'durationMinutes')::integer,
      (v_item ->> 'priceCzk')::integer,
      (v_item ->> 'bufferMinutes')::integer,
      'CZK',
      coalesce((v_item ->> 'active')::boolean, true),
      v_index,
      false
    );
    if coalesce((v_item ->> 'active')::boolean, true) then v_active_count := v_active_count + 1; end if;
  end loop;
  if v_active_count = 0 then
    raise exception 'Beauty onboarding produced no active services' using errcode = '22023';
  end if;

  v_start := (v_payload #>> '{availability,startTime}')::time;
  v_end := (v_payload #>> '{availability,endTime}')::time;
  v_break_enabled := (v_payload #>> '{availability,breakEnabled}')::boolean;
  if v_break_enabled then
    v_break_start := (v_payload #>> '{availability,breakStart}')::time;
    v_break_end := (v_payload #>> '{availability,breakEnd}')::time;
  end if;

  for v_day in select value from jsonb_array_elements_text(v_payload #> '{availability,weekdays}') loop
    v_weekday := case v_day
      when 'mon' then 1 when 'tue' then 2 when 'wed' then 3 when 'thu' then 4
      when 'fri' then 5 when 'sat' then 6 when 'sun' then 7 else null end;
    if v_weekday is null then raise exception 'invalid Beauty onboarding weekday'; end if;

    if v_break_enabled then
      insert into public.beauty_availability_rules(profile_id, weekday, start_time, end_time, timezone, slot_interval_minutes, active)
      values
        (v_profile.id, v_weekday, v_start, v_break_start, 'Europe/Prague', 30, true),
        (v_profile.id, v_weekday, v_break_end, v_end, 'Europe/Prague', 30, true);
    else
      insert into public.beauty_availability_rules(profile_id, weekday, start_time, end_time, timezone, slot_interval_minutes, active)
      values (v_profile.id, v_weekday, v_start, v_end, 'Europe/Prague', 30, true);
    end if;
  end loop;

  update public.beauty_master_onboarding_claims
  set claimed_at = now(), claimed_by_user_key = p_user_key, claimed_profile_id = v_profile.id
  where id = v_claim.id;

  insert into public.audit_log(actor_user_key, action, entity_type, entity_id, metadata)
  values (
    p_user_key,
    'beauty_master_onboarding.claimed',
    'beauty_master_onboarding',
    v_claim.id::text,
    jsonb_build_object('request_id', v_claim.request_id, 'profile_id', v_profile.id)
  );

  return query select 'accepted'::text, v_claim.request_id, v_profile.id, v_profile.slug, 'professional'::text;
end;
$$;

revoke all on function public.go_irl_claim_beauty_master_onboarding(text,text) from public, anon, authenticated;
grant execute on function public.go_irl_claim_beauty_master_onboarding(text,text) to service_role;

revoke all on function public.go_irl_beauty_i18n_complete(jsonb) from public, anon;
revoke all on function public.go_irl_beauty_i18n_fits(jsonb,integer) from public, anon;
revoke all on function public.go_irl_beauty_i18n_sanitize(jsonb,integer) from public, anon;
grant execute on function public.go_irl_beauty_i18n_complete(jsonb) to authenticated, service_role;
grant execute on function public.go_irl_beauty_i18n_fits(jsonb,integer) to authenticated, service_role;
grant execute on function public.go_irl_beauty_i18n_sanitize(jsonb,integer) to authenticated, service_role;

notify pgrst, 'reload schema';


commit;
