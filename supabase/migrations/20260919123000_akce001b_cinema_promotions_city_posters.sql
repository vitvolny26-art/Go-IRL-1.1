-- Akce001B: materialize approved cinema discount promotions into canonical City Posters.
-- Repository migration only. DO NOT apply to production without separate explicit production migration approval.
begin;

do $prerequisites$
begin
  if to_regclass('public.cinema_publication_approval_promotions') is null
     or to_regclass('public.cinema_publication_approvals') is null
     or to_regclass('public.cinema_sources') is null
     or to_regclass('public.cinema_venues') is null then
    raise exception 'Akce001B cinema promotion prerequisites missing';
  end if;
  if to_regclass('public.city_posters_events') is null
     or to_regclass('public.city_posters_event_translations') is null
     or to_regclass('public.city_posters_occurrences') is null
     or to_regclass('public.city_posters_offers') is null then
    raise exception 'Akce001B City Posters prerequisites missing';
  end if;
end
$prerequisites$;

create or replace function public.city_posters_materialize_cinema_promotions(p_approval_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_approval public.cinema_publication_approvals%rowtype;
  v_source public.cinema_sources%rowtype;
  v_venue public.cinema_venues%rowtype;
  v_promo public.cinema_publication_approval_promotions%rowtype;
  v_event_id uuid;
  v_occurrence_id uuid;
  v_slug text;
  v_count integer := 0;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  select * into v_approval
  from public.cinema_publication_approvals
  where id = p_approval_id;

  if not found or v_approval.status <> 'applied' then
    return 0;
  end if;

  select * into v_source from public.cinema_sources where id = v_approval.source_config_id;
  if not found then raise exception 'cinema promotion source missing'; end if;

  select * into v_venue from public.cinema_venues where id = v_source.venue_id;
  if not found then raise exception 'cinema promotion venue missing'; end if;

  for v_promo in
    select *
    from public.cinema_publication_approval_promotions
    where approval_id = p_approval_id
      and selected = true
      and end_date >= (now() at time zone coalesce(v_venue.timezone, 'Europe/Prague'))::date
    order by start_date, promotion_key
  loop
    v_slug := 'cinema-promo-' || substr(md5(v_approval.source_config_id::text || ':' || v_promo.promotion_key), 1, 24);
    v_starts_at := v_promo.start_date::timestamp at time zone coalesce(v_venue.timezone, 'Europe/Prague');
    v_ends_at := (v_promo.end_date + 1)::timestamp at time zone coalesce(v_venue.timezone, 'Europe/Prague');

    insert into public.city_posters_events(
      vertical, subcategory, city_id, canonical_slug, organizer_name, status,
      source_confidence, original_language, metadata, published_at
    ) values (
      'cinema', 'promotion', v_venue.city_id, v_slug, v_venue.name, 'published',
      100, 'cs',
      jsonb_build_object(
        'cinemaPromotion', jsonb_build_object(
          'sourceConfigId', v_approval.source_config_id,
          'approvalId', p_approval_id,
          'promotionKey', v_promo.promotion_key,
          'venueId', v_venue.id
        )
      ),
      now()
    )
    on conflict (city_id, canonical_slug) do update
      set organizer_name = excluded.organizer_name,
          status = 'published',
          source_confidence = excluded.source_confidence,
          original_language = excluded.original_language,
          metadata = excluded.metadata,
          published_at = coalesce(public.city_posters_events.published_at, excluded.published_at),
          updated_at = now()
    returning id into v_event_id;

    insert into public.city_posters_event_translations(
      event_id, language, title, description, source_kind, verified
    ) values (
      v_event_id, 'cs', v_promo.title, coalesce(v_promo.description, ''), 'source', true
    )
    on conflict (event_id, language) do update
      set title = excluded.title,
          description = excluded.description,
          source_kind = excluded.source_kind,
          verified = excluded.verified,
          updated_at = now();

    select id into v_occurrence_id
    from public.city_posters_occurrences
    where event_id = v_event_id
      and metadata->>'cinemaPromotionKey' = v_promo.promotion_key
    order by created_at
    limit 1;

    if v_occurrence_id is null then
      insert into public.city_posters_occurrences(
        event_id, starts_at, ends_at, timezone, status, sales_state, occurrence_url, metadata
      ) values (
        v_event_id, v_starts_at, v_ends_at, coalesce(v_venue.timezone, 'Europe/Prague'),
        'scheduled', 'available', v_promo.source_url,
        jsonb_build_object('cinemaPromotionKey', v_promo.promotion_key, 'allDay', true)
      )
      returning id into v_occurrence_id;
    else
      update public.city_posters_occurrences
      set starts_at = v_starts_at,
          ends_at = v_ends_at,
          timezone = coalesce(v_venue.timezone, 'Europe/Prague'),
          status = 'scheduled',
          sales_state = 'available',
          occurrence_url = v_promo.source_url,
          updated_at = now()
      where id = v_occurrence_id;
    end if;

    update public.city_posters_offers
    set provider_name = v_venue.name,
        url = v_promo.source_url,
        price_from = v_promo.promo_price,
        price_to = v_promo.promo_price,
        currency = coalesce(v_promo.currency, 'CZK'),
        availability_state = 'available',
        official = true,
        active = true,
        last_verified_at = now(),
        metadata = jsonb_build_object(
          'cinemaPromotionKey', v_promo.promotion_key,
          'discountText', v_promo.discount_text,
          'terms', v_promo.terms
        ),
        updated_at = now()
    where id = (
      select offer.id
      from public.city_posters_offers offer
      where offer.event_id = v_event_id
        and offer.metadata->>'cinemaPromotionKey' = v_promo.promotion_key
      order by offer.created_at
      limit 1
    );

    if not found then
      insert into public.city_posters_offers(
        event_id, provider_name, url, price_from, price_to, currency,
        availability_state, official, active, last_verified_at, metadata
      ) values (
        v_event_id, v_venue.name, v_promo.source_url,
        v_promo.promo_price, v_promo.promo_price, coalesce(v_promo.currency, 'CZK'),
        'available', true, true, now(),
        jsonb_build_object(
          'cinemaPromotionKey', v_promo.promotion_key,
          'discountText', v_promo.discount_text,
          'terms', v_promo.terms
        )
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

create or replace function public.city_posters_materialize_cinema_promotions_after_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if new.status = 'applied' and old.status is distinct from new.status then
    perform public.city_posters_materialize_cinema_promotions(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists akce001b_materialize_cinema_promotions
  on public.cinema_publication_approvals;
create trigger akce001b_materialize_cinema_promotions
after update of status on public.cinema_publication_approvals
for each row execute function public.city_posters_materialize_cinema_promotions_after_approval();

revoke all on function public.city_posters_materialize_cinema_promotions(uuid) from public, anon, authenticated;
revoke all on function public.city_posters_materialize_cinema_promotions_after_approval() from public, anon, authenticated;
grant execute on function public.city_posters_materialize_cinema_promotions(uuid) to service_role;

comment on function public.city_posters_materialize_cinema_promotions(uuid) is
  'Akce001B materializes selected approved cinema discount promotions as canonical published City Posters events, occurrences and official offers.';

notify pgrst, 'reload schema';
commit;
