-- AFISHI022: generic transactional City Posters materializer for owner-approved
-- sport / offers / city_events candidates. Applying this migration only defines
-- the RPC; it does not materialize any proposal by itself.

begin;

do $prerequisites$
begin
  if to_regclass('public.city_posters_events') is null
     or to_regclass('public.city_posters_event_translations') is null
     or to_regclass('public.city_posters_occurrences') is null
     or to_regclass('public.city_posters_venues') is null
     or to_regclass('public.city_posters_sources') is null
     or to_regclass('public.city_posters_source_records') is null
     or to_regclass('public.city_posters_offers') is null then
    raise exception 'afishi022_city_posters_prerequisite_missing' using errcode = '55000';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'city_posters_source_records_external_uidx'
  ) then
    raise exception 'afishi022_source_identity_index_missing' using errcode = '55000';
  end if;
end
$prerequisites$;

create or replace function public.city_posters_materialize_candidate(
  p_candidate jsonb,
  p_city_id text default 'olomouc',
  p_language text default 'cs',
  p_timezone text default 'Europe/Prague',
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_candidate_key text;
  v_proposal_key text;
  v_family text;
  v_source_key text;
  v_source_name text;
  v_source_kind text;
  v_source_type text := 'other';
  v_ingestion_method text := 'html';
  v_source_url text;
  v_title text;
  v_description text;
  v_subcategory text;
  v_canonical_vertical text;
  v_topic text := 'auto';
  v_created_via text := 'afishi022_generic_materializer';
  v_official_url text;
  v_image_url text;
  v_venue_name text;
  v_venue_address text;
  v_provider_name text;
  v_content_hash text;
  v_starts_text text;
  v_ends_text text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_confidence_raw numeric;
  v_confidence numeric := 0;
  v_source_id uuid;
  v_event_id uuid;
  v_occurrence_id uuid;
  v_venue_id uuid;
  v_offer_id uuid;
  v_event_record_status text;
  v_occurrence_record_status text;
  v_offer_record_status text;
  v_event_status text;
  v_existing_family text;
  v_existing_city_id text;
  v_existing_vertical text;
  v_existing_status text;
  v_slug_base text;
  v_city_slug text;
  v_canonical_slug text;
  v_venue_slug_base text;
  v_venue_slug text;
  v_event_reused boolean := false;
  v_occurrence_reused boolean := false;
  v_offer_reused boolean := false;
begin
  if p_candidate is null or pg_catalog.jsonb_typeof(p_candidate) <> 'object' then
    raise exception 'afishi022_candidate_object_required' using errcode = '22023';
  end if;

  p_city_id := pg_catalog.btrim(pg_catalog.coalesce(p_city_id, ''));
  p_language := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_language, '')));
  p_timezone := pg_catalog.btrim(pg_catalog.coalesce(p_timezone, ''));
  if p_city_id = '' then raise exception 'afishi022_city_required' using errcode = '22023'; end if;
  if p_language not in ('ru','uk','cs','en','pl','sk') then raise exception 'afishi022_language_invalid' using errcode = '22023'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'afishi022_timezone_invalid' using errcode = '22023';
  end if;

  v_candidate_key := pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'candidate_key', ''));
  v_proposal_key := pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'proposal_key', ''));
  v_family := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'vertical', '')));
  v_source_key := pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'source_id', ''));
  v_source_name := pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'source_name', v_source_key)), 160);
  v_source_kind := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'source_kind', '')));
  v_source_url := pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'source_url', ''));
  v_title := pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'title', '')), 220);
  v_description := pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'description', '')), 2000);
  v_subcategory := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'subcategory', '')));
  v_official_url := pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'official_url', v_source_url, ''));
  v_image_url := pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'image_url', ''));
  v_venue_name := pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'venue_name', '')), 180);
  v_venue_address := pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'venue_address', '')), 300);
  v_provider_name := pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'provider_name', v_source_name, v_source_key)), 120);
  v_content_hash := pg_catalog.left(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'content_hash', '')), 160);
  v_starts_text := pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'starts_at', ''));
  v_ends_text := pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'ends_at', ''));

  if v_candidate_key = '' or v_source_key = '' or v_title = '' then
    raise exception 'afishi022_candidate_identity_required' using errcode = '22023';
  end if;
  if v_family not in ('sport','offers','city_events') then
    raise exception 'afishi022_candidate_vertical_invalid' using errcode = '22023';
  end if;
  if v_official_url !~* '^https://[^[:space:]]+$' then
    raise exception 'afishi022_official_url_invalid' using errcode = '22023';
  end if;
  if v_image_url <> '' and v_image_url !~* '^https://[^[:space:]]+$' then
    raise exception 'afishi022_image_url_invalid' using errcode = '22023';
  end if;
  if v_starts_text = '' then
    raise exception 'afishi022_starts_at_required' using errcode = '22023';
  end if;

  begin
    if v_starts_text ~* '(Z|[+-][0-9]{2}:[0-9]{2})$' then
      v_starts_at := v_starts_text::timestamptz;
    else
      v_starts_at := v_starts_text::timestamp at time zone p_timezone;
    end if;
    if v_ends_text <> '' then
      if v_ends_text ~* '(Z|[+-][0-9]{2}:[0-9]{2})$' then
        v_ends_at := v_ends_text::timestamptz;
      else
        v_ends_at := v_ends_text::timestamp at time zone p_timezone;
      end if;
    end if;
  exception when others then
    raise exception 'afishi022_candidate_time_invalid' using errcode = '22007';
  end;

  begin
    v_confidence_raw := nullif(pg_catalog.btrim(pg_catalog.coalesce(p_candidate ->> 'source_confidence', '')), '')::numeric;
  exception when others then
    raise exception 'afishi022_source_confidence_invalid' using errcode = '22023';
  end;
  if v_confidence_raw is null then v_confidence := 0;
  elsif v_confidence_raw between 0 and 1 then v_confidence := v_confidence_raw * 100;
  else v_confidence := v_confidence_raw;
  end if;
  if v_confidence < 0 or v_confidence > 100 then
    raise exception 'afishi022_source_confidence_invalid' using errcode = '22023';
  end if;

  if v_family = 'sport' then
    v_canonical_vertical := 'sport';
    if v_subcategory = '' then v_subcategory := 'sport'; end if;
    v_topic := 'sport';
  elsif v_family = 'offers' then
    v_canonical_vertical := 'city_special';
    v_subcategory := 'offer';
    v_topic := 'promotions';
    v_created_via := 'admin_offer_creation';
    if v_image_url = '' then raise exception 'afishi022_offer_image_required' using errcode = '22023'; end if;
    -- Proposal normalization uses inclusive local end-of-day. Canonical all-day ranges use exclusive end.
    if v_ends_at is not null and v_ends_text ~ 'T23:59:59$' then v_ends_at := v_ends_at + interval '1 second'; end if;
    if v_ends_at is null or v_ends_at <= v_starts_at then
      raise exception 'afishi022_offer_period_required' using errcode = '22023';
    end if;
  else
    if v_subcategory = 'sport' then
      v_canonical_vertical := 'sport'; v_topic := 'sport';
    elsif v_subcategory = 'vzdelavani' then
      v_canonical_vertical := 'education'; v_topic := 'education';
    else
      v_canonical_vertical := 'city_special';
      if v_subcategory = 'kultura' then v_topic := 'culture'; end if;
      if v_subcategory = '' then v_subcategory := 'city_event'; end if;
    end if;
  end if;

  if v_ends_at is not null and v_ends_at < v_starts_at then
    raise exception 'afishi022_candidate_period_invalid' using errcode = '22023';
  end if;
  if v_source_kind = 'official_city_calendar' then v_source_type := 'city_platform'; v_ingestion_method := 'api';
  elsif v_source_kind = 'official_web' then v_source_type := 'official_venue';
  end if;
  if v_source_url = '' or v_source_url !~* '^https://[^[:space:]]+$' then v_source_url := v_official_url; end if;

  v_slug_base := pg_catalog.lower(pg_catalog.translate(
    v_title,
    'áäčďéěëíľĺňóöôŕřšťúůüýžÁÄČĎÉĚËÍĽĹŇÓÖÔŔŘŠŤÚŮÜÝŽ',
    'aacdeeeillnooorrstuuuyzAACDEEEILLNOOORRSTUUUYZ'
  ));
  v_slug_base := pg_catalog.btrim(pg_catalog.regexp_replace(v_slug_base, '[^a-z0-9]+', '-', 'g'), '-');
  if v_slug_base = '' then v_slug_base := 'event'; end if;
  v_city_slug := pg_catalog.btrim(pg_catalog.lower(pg_catalog.regexp_replace(p_city_id, '[^a-z0-9]+', '-', 'g')), '-');
  if v_city_slug = '' then v_city_slug := 'city'; end if;
  v_canonical_slug := pg_catalog.left(v_slug_base, 48) || '-' || pg_catalog.left(v_city_slug, 24)
    || '-' || pg_catalog.substr(pg_catalog.md5(v_source_key || '|' || v_candidate_key), 1, 10);

  if p_dry_run then
    return pg_catalog.jsonb_build_object(
      'ok',true,'dry_run',true,'city_id',p_city_id,'candidate_key',v_candidate_key,'source_key',v_source_key,
      'family',v_family,'vertical',v_canonical_vertical,'subcategory',v_subcategory,'canonical_slug',v_canonical_slug,
      'starts_at',v_starts_at,'ends_at',v_ends_at,'timezone',p_timezone,'telegram_topic_kind',v_topic,
      'has_offer',v_family='offers','has_venue',v_venue_name<>''
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('afishi022|' || v_source_key || '|' || v_candidate_key, 0));

  insert into public.city_posters_sources as source (
    source_key,name,source_type,base_url,ingestion_method,supported_cities,supported_verticals,
    trust_level,priority,owner_label,active,last_success_at,metadata
  ) values (
    v_source_key,v_source_name,v_source_type,v_source_url,v_ingestion_method,
    pg_catalog.jsonb_build_array(p_city_id),pg_catalog.jsonb_build_array(v_family),
    pg_catalog.round(v_confidence)::integer,100,'AFISHI022',true,pg_catalog.now(),
    pg_catalog.jsonb_build_object('task','AFISHI022','created_via','city_posters_materialize_candidate','source_kind',v_source_kind)
  )
  on conflict (source_key) do update set
    last_success_at=excluded.last_success_at,
    trust_level=pg_catalog.greatest(source.trust_level,excluded.trust_level),
    supported_cities=case when source.supported_cities ? p_city_id then source.supported_cities else source.supported_cities || pg_catalog.jsonb_build_array(p_city_id) end,
    supported_verticals=case when source.supported_verticals ? v_family then source.supported_verticals else source.supported_verticals || pg_catalog.jsonb_build_array(v_family) end,
    metadata=source.metadata || pg_catalog.jsonb_build_object('afishi022_last_materialized_at',pg_catalog.now())
  returning source.id into v_source_id;

  select record.match_status,record.event_id into v_event_record_status,v_event_id
  from public.city_posters_source_records record
  where record.source_id=v_source_id and record.entity_type='event' and record.external_id=v_candidate_key
  for update;

  if found then
    if v_event_record_status <> 'matched' or v_event_id is null then
      raise exception 'afishi022_event_source_record_not_writable' using errcode = '55000';
    end if;
    v_event_reused := true;
    select event.status,event.metadata->>'afishi022_vertical',event.city_id,event.vertical,event.canonical_slug
    into v_event_status,v_existing_family,v_existing_city_id,v_existing_vertical,v_canonical_slug
    from public.city_posters_events event where event.id=v_event_id for update;
    if not found then raise exception 'afishi022_event_target_missing' using errcode = '55000'; end if;
    if v_event_status in ('cancelled','expired','rejected') then raise exception 'afishi022_event_target_terminal' using errcode = '55000'; end if;
    if v_existing_city_id <> p_city_id then raise exception 'afishi022_event_city_conflict' using errcode = '55000'; end if;
    if (v_existing_family is not null and v_existing_family <> v_family) or v_existing_vertical <> v_canonical_vertical then
      raise exception 'afishi022_event_vertical_conflict' using errcode = '55000';
    end if;
  else
    insert into public.city_posters_events (
      vertical,subcategory,city_id,canonical_slug,organizer_name,status,source_confidence,
      hero_media_url,original_language,metadata
    ) values (
      v_canonical_vertical,v_subcategory,p_city_id,v_canonical_slug,nullif(v_provider_name,v_source_key),'ready',v_confidence,
      nullif(v_image_url,''),p_language,
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'task','AFISHI022','created_via',v_created_via,'afishi022_materializer','v1','afishi022_vertical',v_family,
        'candidate_key',v_candidate_key,'proposal_key',nullif(v_proposal_key,''),'source_id',v_source_key,
        'official_url',v_official_url,'telegram_topic_kind',v_topic,'telegram_auto_publish',false,
        'campaign',case when v_family='offers' then v_candidate_key else null end,
        'campaign_key',case when v_family='offers' then v_candidate_key else null end,
        'price_conditions',case when v_family='offers' then v_description else null end,
        'period_start_defined',case when v_family='offers' then true else null end,
        'period_defined',case when v_family='offers' then true else null end
      ))
    ) returning id into v_event_id;
  end if;

  if v_venue_name <> '' then
    v_venue_slug_base := pg_catalog.lower(pg_catalog.translate(
      v_venue_name,
      'áäčďéěëíľĺňóöôŕřšťúůüýžÁÄČĎÉĚËÍĽĹŇÓÖÔŔŘŠŤÚŮÜÝŽ',
      'aacdeeeillnooorrstuuuyzAACDEEEILLNOOORRSTUUUYZ'
    ));
    v_venue_slug_base := pg_catalog.btrim(pg_catalog.regexp_replace(v_venue_slug_base,'[^a-z0-9]+','-','g'),'-');
    if v_venue_slug_base = '' then v_venue_slug_base := 'venue'; end if;
    v_venue_slug := 'afishi022-' || pg_catalog.left(v_venue_slug_base,36) || '-'
      || pg_catalog.substr(pg_catalog.md5(pg_catalog.lower(v_venue_name) || '|' || pg_catalog.lower(v_venue_address)),1,10);
    insert into public.city_posters_venues as venue (
      city_id,canonical_name,slug,aliases,venue_type,address,timezone,official_url,active,metadata
    ) values (
      p_city_id,v_venue_name,v_venue_slug,'[]'::jsonb,'other',nullif(v_venue_address,''),p_timezone,v_official_url,true,
      pg_catalog.jsonb_build_object('task','AFISHI022','created_via','city_posters_materialize_candidate','source_id',v_source_key)
    )
    on conflict (city_id,slug) do update set
      canonical_name=excluded.canonical_name,address=pg_catalog.coalesce(excluded.address,venue.address),timezone=excluded.timezone,
      official_url=pg_catalog.coalesce(excluded.official_url,venue.official_url),active=true,metadata=venue.metadata || excluded.metadata
    returning venue.id into v_venue_id;
  end if;

  update public.city_posters_events as event set
    vertical=v_canonical_vertical,subcategory=v_subcategory,
    organizer_name=pg_catalog.coalesce(nullif(v_provider_name,v_source_key),event.organizer_name),
    primary_venue_id=pg_catalog.coalesce(v_venue_id,event.primary_venue_id),
    status=case when event.status='published' then 'published' else 'ready' end,
    source_confidence=v_confidence,hero_media_url=pg_catalog.coalesce(nullif(v_image_url,''),event.hero_media_url),
    original_language=p_language,
    metadata=event.metadata || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'task','AFISHI022','created_via',v_created_via,'afishi022_materializer','v1','afishi022_vertical',v_family,
      'candidate_key',v_candidate_key,'proposal_key',nullif(v_proposal_key,''),'source_id',v_source_key,
      'official_url',v_official_url,'telegram_topic_kind',v_topic,'telegram_auto_publish',false,
      'campaign',case when v_family='offers' then v_candidate_key else null end,
      'campaign_key',case when v_family='offers' then v_candidate_key else null end,
      'price_conditions',case when v_family='offers' then v_description else null end,
      'period_start_defined',case when v_family='offers' then true else null end,
      'period_defined',case when v_family='offers' then true else null end
    ))
  where event.id=v_event_id;

  insert into public.city_posters_event_translations as translation (event_id,language,title,description,source_kind,verified)
  values (v_event_id,p_language,v_title,v_description,'source',true)
  on conflict (event_id,language) do update set title=excluded.title,description=excluded.description,source_kind='source',verified=true;

  insert into public.city_posters_source_records (
    source_id,entity_type,external_id,source_url,payload_fingerprint,event_id,match_status,match_confidence,last_seen_at,metadata
  ) values (
    v_source_id,'event',v_candidate_key,v_official_url,nullif(v_content_hash,''),v_event_id,'matched',v_confidence,pg_catalog.now(),
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('task','AFISHI022','proposal_key',nullif(v_proposal_key,''),'family',v_family))
  )
  on conflict (source_id,entity_type,external_id) where external_id is not null do update set
    source_url=excluded.source_url,payload_fingerprint=excluded.payload_fingerprint,event_id=excluded.event_id,
    match_status='matched',match_confidence=excluded.match_confidence,last_seen_at=excluded.last_seen_at,
    metadata=public.city_posters_source_records.metadata || excluded.metadata;

  select record.match_status,record.occurrence_id into v_occurrence_record_status,v_occurrence_id
  from public.city_posters_source_records record
  where record.source_id=v_source_id and record.entity_type='occurrence' and record.external_id=v_candidate_key || ':occurrence'
  for update;

  if found then
    if v_occurrence_record_status <> 'matched' or v_occurrence_id is null then
      raise exception 'afishi022_occurrence_source_record_not_writable' using errcode = '55000';
    end if;
    v_occurrence_reused := true;
    select occurrence.status into v_existing_status
    from public.city_posters_occurrences occurrence
    where occurrence.id=v_occurrence_id and occurrence.event_id=v_event_id for update;
    if not found then raise exception 'afishi022_occurrence_target_missing' using errcode = '55000'; end if;
    if v_existing_status in ('cancelled','ended') then raise exception 'afishi022_occurrence_target_terminal' using errcode = '55000'; end if;
    update public.city_posters_occurrences set
      venue_id=v_venue_id,starts_at=v_starts_at,ends_at=v_ends_at,timezone=p_timezone,status='scheduled',
      sales_state=case when v_family='offers' then 'available' else 'unknown' end,occurrence_url=v_official_url,
      metadata=metadata || pg_catalog.jsonb_build_object('task','AFISHI022','candidate_key',v_candidate_key,'source_id',v_source_key,'all_day',v_family='offers')
    where id=v_occurrence_id;
  else
    insert into public.city_posters_occurrences (
      event_id,venue_id,starts_at,ends_at,timezone,status,sales_state,occurrence_url,metadata
    ) values (
      v_event_id,v_venue_id,v_starts_at,v_ends_at,p_timezone,'scheduled',
      case when v_family='offers' then 'available' else 'unknown' end,v_official_url,
      pg_catalog.jsonb_build_object('task','AFISHI022','candidate_key',v_candidate_key,'source_id',v_source_key,'all_day',v_family='offers')
    ) returning id into v_occurrence_id;
  end if;

  insert into public.city_posters_source_records (
    source_id,entity_type,external_id,source_url,payload_fingerprint,occurrence_id,match_status,match_confidence,last_seen_at,metadata
  ) values (
    v_source_id,'occurrence',v_candidate_key || ':occurrence',v_official_url,nullif(v_content_hash,''),v_occurrence_id,'matched',v_confidence,pg_catalog.now(),
    pg_catalog.jsonb_build_object('task','AFISHI022','candidate_key',v_candidate_key)
  )
  on conflict (source_id,entity_type,external_id) where external_id is not null do update set
    source_url=excluded.source_url,payload_fingerprint=excluded.payload_fingerprint,occurrence_id=excluded.occurrence_id,
    match_status='matched',match_confidence=excluded.match_confidence,last_seen_at=excluded.last_seen_at,
    metadata=public.city_posters_source_records.metadata || excluded.metadata;

  if v_family = 'offers' then
    select record.match_status,record.offer_id into v_offer_record_status,v_offer_id
    from public.city_posters_source_records record
    where record.source_id=v_source_id and record.entity_type='offer' and record.external_id=v_candidate_key || ':offer'
    for update;
    if found then
      if v_offer_record_status <> 'matched' or v_offer_id is null then
        raise exception 'afishi022_offer_source_record_not_writable' using errcode = '55000';
      end if;
      v_offer_reused := true;
      update public.city_posters_offers set
        event_id=null,occurrence_id=v_occurrence_id,provider_name=v_provider_name,url=v_official_url,
        price_from=null,price_to=null,currency=null,availability_state='available',official=true,active=true,last_verified_at=pg_catalog.now(),
        metadata=metadata || pg_catalog.jsonb_build_object('task','AFISHI022','candidate_key',v_candidate_key,'price_conditions',v_description)
      where id=v_offer_id;
      if not found then raise exception 'afishi022_offer_target_missing' using errcode = '55000'; end if;
    else
      insert into public.city_posters_offers (
        occurrence_id,provider_name,url,price_from,price_to,currency,availability_state,official,active,last_verified_at,metadata
      ) values (
        v_occurrence_id,v_provider_name,v_official_url,null,null,null,'available',true,true,pg_catalog.now(),
        pg_catalog.jsonb_build_object('task','AFISHI022','candidate_key',v_candidate_key,'price_conditions',v_description)
      ) returning id into v_offer_id;
    end if;
    insert into public.city_posters_source_records (
      source_id,entity_type,external_id,source_url,payload_fingerprint,offer_id,match_status,match_confidence,last_seen_at,metadata
    ) values (
      v_source_id,'offer',v_candidate_key || ':offer',v_official_url,nullif(v_content_hash,''),v_offer_id,'matched',v_confidence,pg_catalog.now(),
      pg_catalog.jsonb_build_object('task','AFISHI022','candidate_key',v_candidate_key)
    )
    on conflict (source_id,entity_type,external_id) where external_id is not null do update set
      source_url=excluded.source_url,payload_fingerprint=excluded.payload_fingerprint,offer_id=excluded.offer_id,
      match_status='matched',match_confidence=excluded.match_confidence,last_seen_at=excluded.last_seen_at,
      metadata=public.city_posters_source_records.metadata || excluded.metadata;
  end if;

  select event.status into v_event_status from public.city_posters_events event where event.id=v_event_id;
  return pg_catalog.jsonb_build_object(
    'ok',true,'dry_run',false,'city_id',p_city_id,'candidate_key',v_candidate_key,'source_key',v_source_key,'source_id',v_source_id,
    'event_id',v_event_id,'occurrence_id',v_occurrence_id,'venue_id',v_venue_id,'offer_id',v_offer_id,'canonical_slug',v_canonical_slug,
    'event_reused',v_event_reused,'occurrence_reused',v_occurrence_reused,'offer_reused',v_offer_reused,
    'status',v_event_status,'telegram_auto_publish',false
  );
end
$function$;

revoke all on function public.city_posters_materialize_candidate(jsonb,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.city_posters_materialize_candidate(jsonb,text,text,text,boolean) to service_role;

comment on function public.city_posters_materialize_candidate(jsonb,text,text,text,boolean) is
  'AFISHI022 service-role-only transactional materializer for owner-approved sport/offers/city_events proposals. Stable source identity is authoritative; title-only dedupe is forbidden; Telegram auto-publish remains disabled.';

notify pgrst, 'reload schema';
commit;
