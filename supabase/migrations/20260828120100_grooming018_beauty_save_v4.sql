-- GROOMING018: split from the approved local onboarding migration for connector-safe commit transport.
begin;

-- Backward-compatible save v4: v3 remains untouched; v4 restores the PL/SK keys after v3 validation/save.
create or replace function public.save_my_beauty_profile_v4(
  p_display_name text,
  p_public_location text,
  p_contact text,
  p_exact_address text,
  p_description_i18n jsonb,
  p_instagram_url text,
  p_experience_i18n jsonb,
  p_specialization_i18n jsonb,
  p_hygiene_i18n jsonb,
  p_materials_i18n jsonb,
  p_spoken_languages_i18n jsonb,
  p_certificates_i18n jsonb,
  p_booking_notes_i18n jsonb,
  p_portfolio jsonb,
  p_services jsonb,
  p_publication_state text,
  p_expected_updated_at timestamptz default null
)
returns table (
  status text,
  profile_id uuid,
  slug text,
  publication_state text,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_result record;
  v_portfolio jsonb;
  v_item jsonb;
  v_index integer;
  v_client_key text;
begin
  select * into v_result
  from public.save_my_beauty_profile_v3(
    p_display_name,
    p_public_location,
    p_contact,
    p_exact_address,
    p_description_i18n,
    p_instagram_url,
    p_experience_i18n,
    p_specialization_i18n,
    p_hygiene_i18n,
    p_materials_i18n,
    p_spoken_languages_i18n,
    p_certificates_i18n,
    p_booking_notes_i18n,
    p_portfolio,
    p_services,
    p_publication_state,
    p_expected_updated_at
  );

  if v_result.status <> 'saved' then
    return query select
      v_result.status::text,
      v_result.profile_id::uuid,
      v_result.slug::text,
      v_result.publication_state::text,
      v_result.updated_at::timestamptz;
    return;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', left(regexp_replace(coalesce(item ->> 'id', 'work-' || (ordinality - 1)), '[^A-Za-z0-9._:-]+', '-', 'g'), 120),
      'image_url', left(btrim(coalesce(item ->> 'image_url', '')), 1200),
      'alt_i18n', public.go_irl_beauty_i18n_sanitize(item -> 'alt_i18n', 300),
      'sort_order', ordinality - 1
    ) order by ordinality
  ) filter (where btrim(coalesce(item ->> 'image_url', '')) <> ''), '[]'::jsonb)
  into v_portfolio
  from jsonb_array_elements(coalesce(p_portfolio, '[]'::jsonb)) with ordinality as source(item, ordinality);

  update public.beauty_professional_profiles
  set
    description_i18n = public.go_irl_beauty_i18n_sanitize(p_description_i18n, 1200),
    experience_i18n = public.go_irl_beauty_i18n_sanitize(p_experience_i18n, 700),
    specialization_i18n = public.go_irl_beauty_i18n_sanitize(p_specialization_i18n, 700),
    hygiene_i18n = public.go_irl_beauty_i18n_sanitize(p_hygiene_i18n, 700),
    materials_i18n = public.go_irl_beauty_i18n_sanitize(p_materials_i18n, 700),
    spoken_languages_i18n = public.go_irl_beauty_i18n_sanitize(p_spoken_languages_i18n, 400),
    certificates_i18n = public.go_irl_beauty_i18n_sanitize(p_certificates_i18n, 700),
    booking_notes_i18n = public.go_irl_beauty_i18n_sanitize(p_booking_notes_i18n, 700),
    portfolio = v_portfolio
  where id = v_result.profile_id
    and owner_user_key = public.go_irl_auth_user_key();

  for v_item, v_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(coalesce(p_services, '[]'::jsonb)) with ordinality
  loop
    v_client_key := left(regexp_replace(btrim(coalesce(v_item ->> 'id', 'service-' || v_index)), '[^A-Za-z0-9._:-]+', '-', 'g'), 120);
    if char_length(v_client_key) < 3 then v_client_key := 'service-' || v_index; end if;

    update public.beauty_professional_services
    set service_name_i18n = public.go_irl_beauty_i18n_sanitize(v_item -> 'name_i18n', 120)
    where profile_id = v_result.profile_id
      and client_key = v_client_key
      and archived = false;
  end loop;

  return query
  select
    'saved'::text,
    profile.id,
    profile.slug,
    profile.publication_state,
    greatest(
      profile.updated_at,
      coalesce((
        select max(service.updated_at)
        from public.beauty_professional_services service
        where service.profile_id = profile.id and service.archived = false
      ), profile.updated_at)
    )
  from public.beauty_professional_profiles profile
  where profile.id = v_result.profile_id;
end;
$$;

revoke all on function public.save_my_beauty_profile_v4(text,text,text,text,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,timestamptz) from public, anon;
grant execute on function public.save_my_beauty_profile_v4(text,text,text,text,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,timestamptz) to authenticated;


commit;
