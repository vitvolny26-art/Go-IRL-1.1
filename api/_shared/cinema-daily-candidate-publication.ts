import type { SupabaseClient } from "@supabase/supabase-js";

export const cinemaDailyPublicationLanguages = ["ru", "uk", "cs", "en", "pl", "sk"] as const;
export type CinemaDailyPublicationLanguage = typeof cinemaDailyPublicationLanguages[number];

export type CinemaDailyPublicationInput = {
  catalogMovieId: string;
};

type CatalogMovieRow = {
  id: string;
  city_id: string;
  selection_week_start: string;
  selection_week_end: string;
  rank: number;
  source_movie_key: string;
  imdb_id: string | null;
  canonical_title: string;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  genres: unknown;
  age_rating: string | null;
  imdb_rating: number | null;
  poster_url: string | null;
  description: string | null;
  director: string | null;
  lead_actors: unknown;
  translations: Record<string, { title?: string; description?: string }> | null;
  readiness: Record<string, unknown> | null;
  publication_state: string;
  published_event_id: string | null;
  published_at: string | null;
};

type CatalogScreeningRow = {
  id: string;
  catalog_movie_id: string;
  source_screening_key: string;
  cinema_key: string;
  cinema_name: string;
  cinema_address: string | null;
  venue_timezone: string;
  starts_at: string;
  ends_at: string | null;
  audio_language: string | null;
  subtitle_languages: unknown;
  version_type: string | null;
  format: string | null;
  auditorium: string | null;
  screening_tags: unknown;
  ticket_url: string | null;
  source_url: string | null;
  source_id: string | null;
};

type ExistingEventRow = {
  id: string;
  status: string;
  published_at: string | null;
  metadata: Record<string, unknown> | null;
};

type ExistingOccurrenceRow = {
  id: string;
  metadata: Record<string, unknown> | null;
};

export type CinemaDailyPublicationSummary = {
  mode: "cinema_compact_city_posters_publication";
  catalog_movie_id: string;
  event_id: string;
  canonical_slug: string;
  city_id: string;
  source_movie_key: string;
  screening_count: number;
  occurrence_count: number;
  venue_count: number;
  publication_authorized: true;
  provider_distribution_authorized: true;
  telegram_auto_publish: true;
  idempotent: boolean;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const metadataObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const httpsUrl = (value: unknown) => {
  const text = clean(value, 2_000);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};

const slugify = (value: string, limit = 72) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, limit);

export function validateCinemaDailyPublicationInput(input: CinemaDailyPublicationInput) {
  if (!input || typeof input !== "object" || !uuid.test(String(input.catalogMovieId || ""))) {
    throw new Error("cinema_daily_publication_body_invalid");
  }
}

const ensureVenue = async (
  db: SupabaseClient,
  movie: CatalogMovieRow,
  screening: CatalogScreeningRow,
) => {
  const slug = `cinema-${slugify(screening.cinema_key || screening.cinema_name, 56) || screening.id.slice(0, 8)}`;
  const lookup = await db.from("city_posters_venues")
    .select("id,metadata")
    .eq("city_id", movie.city_id)
    .eq("slug", slug)
    .maybeSingle();

  if (lookup.error) throw new Error(`cinema_daily_publication_venue_lookup_failed:${lookup.error.code || "unknown"}`);

  const payload = {
    city_id: movie.city_id,
    canonical_name: screening.cinema_name,
    slug,
    aliases: [],
    venue_type: "cinema",
    address: screening.cinema_address,
    timezone: screening.venue_timezone,
    official_url: httpsUrl(screening.source_url) || null,
    active: true,
    metadata: {
      ...metadataObject(lookup.data?.metadata),
      source: "cinema_catalog_screenings",
      cinemaKey: screening.cinema_key,
    },
  };

  if (lookup.data?.id) {
    const update = await db.from("city_posters_venues").update(payload).eq("id", lookup.data.id);
    if (update.error) throw new Error(`cinema_daily_publication_venue_update_failed:${update.error.code || "unknown"}`);
    return String(lookup.data.id);
  }

  const insert = await db.from("city_posters_venues").insert(payload).select("id").single();
  if (insert.error || !insert.data?.id) {
    throw new Error(`cinema_daily_publication_venue_create_failed:${insert.error?.code || "unknown"}`);
  }
  return String(insert.data.id);
};

export async function materializeApprovedDailyCinemaCandidate(options: {
  db: SupabaseClient;
  input: CinemaDailyPublicationInput;
  actorUserKey: string;
  now?: Date;
}): Promise<CinemaDailyPublicationSummary> {
  validateCinemaDailyPublicationInput(options.input);
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("cinema_daily_publication_now_invalid");
  const nowIso = now.toISOString();

  const movieResult = await options.db.from("cinema_catalog_movies")
    .select("id,city_id,selection_week_start,selection_week_end,rank,source_movie_key,imdb_id,canonical_title,original_title,release_year,duration_minutes,genres,age_rating,imdb_rating,poster_url,description,director,lead_actors,translations,readiness,publication_state,published_event_id,published_at")
    .eq("id", options.input.catalogMovieId)
    .single();

  if (movieResult.error || !movieResult.data) {
    throw new Error(`cinema_daily_publication_candidate_load_failed:${movieResult.error?.code || "not_found"}`);
  }
  const movie = movieResult.data as CatalogMovieRow;
  if (movie.publication_state !== "approved") {
    throw new Error("cinema_daily_publication_owner_approval_required");
  }
  if (metadataObject(movie.readiness).ready !== true) {
    throw new Error("cinema_daily_publication_candidate_not_ready");
  }

  const posterUrl = httpsUrl(movie.poster_url);
  if (!posterUrl) throw new Error("cinema_daily_publication_poster_invalid");

  const translations = metadataObject(movie.translations);
  for (const language of cinemaDailyPublicationLanguages) {
    const row = metadataObject(translations[language]);
    if (!clean(row.title, 180) || !clean(row.description, 4_000)) {
      throw new Error(`cinema_daily_publication_translation_missing:${language}`);
    }
  }

  const screeningsResult = await options.db.from("cinema_catalog_screenings")
    .select("id,catalog_movie_id,source_screening_key,cinema_key,cinema_name,cinema_address,venue_timezone,starts_at,ends_at,audio_language,subtitle_languages,version_type,format,auditorium,screening_tags,ticket_url,source_url,source_id")
    .eq("catalog_movie_id", movie.id)
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true });

  if (screeningsResult.error) {
    throw new Error(`cinema_daily_publication_screenings_load_failed:${screeningsResult.error.code || "unknown"}`);
  }
  const screenings = (screeningsResult.data || []) as CatalogScreeningRow[];
  if (!screenings.length) throw new Error("cinema_daily_publication_no_screenings");

  const claimResult = await options.db.rpc("claim_cinema_catalog_movie_for_publication", {
    p_catalog_movie_id: movie.id,
  });
  if (claimResult.error || String(claimResult.data || "") !== movie.id) {
    throw new Error(`cinema_daily_publication_claim_failed:${claimResult.error?.code || "state_changed"}`);
  }

  const releaseClaim = async () => {
    const release = await options.db.from("cinema_catalog_movies").update({
      publication_state: "approved",
      updated_at: new Date().toISOString(),
    }).eq("id", movie.id).eq("publication_state", "publishing");
    if (release.error) {
      console.warn("cinema_daily_publication_claim_release_failed", {
        catalogMovieId: movie.id,
        reason: String(release.error.message || "unknown").slice(0, 160),
      });
    }
  };

  try {
  const venueByKey = new Map<string, { id: string; name: string }>();
  for (const screening of screenings) {
    if (!venueByKey.has(screening.cinema_key)) {
      venueByKey.set(screening.cinema_key, {
        id: await ensureVenue(options.db, movie, screening),
        name: screening.cinema_name,
      });
    }
  }

  const slug = `cinema-${slugify(movie.canonical_title, 44) || "movie"}-${slugify(movie.source_movie_key, 28) || movie.id.slice(0, 8)}`;
  const existingResult = await options.db.from("city_posters_events")
    .select("id,status,published_at,metadata")
    .eq("city_id", movie.city_id)
    .eq("canonical_slug", slug)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(`cinema_daily_publication_event_lookup_failed:${existingResult.error.code || "unknown"}`);
  }
  const existing = (existingResult.data || null) as ExistingEventRow | null;

  if (existing?.id) {
    const telegram = await options.db.from("city_posters_telegram_publications")
      .select("event_id")
      .eq("event_id", existing.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (telegram.error) throw new Error(`cinema_daily_publication_provider_lookup_failed:${telegram.error.code || "unknown"}`);
    if (telegram.data) throw new Error("cinema_daily_publication_provider_already_distributed");
  }

  const venueNames = [...new Set([...venueByKey.values()].map((value) => value.name))];
  const primaryVenueId = venueByKey.size === 1 ? [...venueByKey.values()][0].id : null;
  const firstOfficialSource = screenings
    .map((row) => httpsUrl(row.ticket_url) || httpsUrl(row.source_url))
    .find(Boolean) || "";

  const eventMetadata = {
    ...metadataObject(existing?.metadata),
    task: "KINO000P",
    created_via: "cinema_compact_catalog_publication",
    official_source: firstOfficialSource,
    telegram_auto_publish: true,
    telegram_topic_kind: "culture",
    provider_distribution: { telegram: "automatic" },
    cinemaCatalog: {
      catalogMovieId: movie.id,
      sourceMovieKey: movie.source_movie_key,
      imdbId: movie.imdb_id,
      cityId: movie.city_id,
      selectionWeekStart: movie.selection_week_start,
      selectionWeekEnd: movie.selection_week_end,
      rank: movie.rank,
      screeningCount: screenings.length,
    },
  };

  let eventId = existing?.id || "";
  const eventPayload = {
    vertical: "cinema",
    subcategory: "movie",
    city_id: movie.city_id,
    canonical_slug: slug,
    organizer_name: venueNames.join(", ").slice(0, 240),
    primary_venue_id: primaryVenueId,
    status: "ready",
    source_confidence: 100,
    hero_media_url: posterUrl,
    age_rule: movie.age_rating,
    original_language: "cs",
    metadata: eventMetadata,
    published_at: null,
  };

  if (eventId) {
    const update = await options.db.from("city_posters_events").update({
      ...eventPayload,
      status: existing?.status === "published" ? "published" : "ready",
      published_at: existing?.status === "published" ? existing.published_at : null,
    }).eq("id", eventId);
    if (update.error) throw new Error(`cinema_daily_publication_event_update_failed:${update.error.code || "unknown"}`);
  } else {
    const insert = await options.db.from("city_posters_events").insert(eventPayload).select("id").single();
    if (insert.error || !insert.data?.id) {
      throw new Error(`cinema_daily_publication_event_create_failed:${insert.error?.code || "unknown"}`);
    }
    eventId = String(insert.data.id);
  }

  const translationRows = cinemaDailyPublicationLanguages.map((language) => {
    const row = metadataObject(translations[language]);
    return {
      event_id: eventId,
      language,
      title: clean(row.title, 180),
      description: clean(row.description, 4_000),
      source_kind: "machine",
      verified: false,
    };
  });

  const translationWrite = await options.db.from("city_posters_event_translations")
    .upsert(translationRows, { onConflict: "event_id,language" });
  if (translationWrite.error) {
    throw new Error(`cinema_daily_publication_translation_write_failed:${translationWrite.error.code || "unknown"}`);
  }

  const existingOccurrencesResult = await options.db.from("city_posters_occurrences")
    .select("id,metadata")
    .eq("event_id", eventId);
  if (existingOccurrencesResult.error) {
    throw new Error(`cinema_daily_publication_occurrence_lookup_failed:${existingOccurrencesResult.error.code || "unknown"}`);
  }
  const existingOccurrences = (existingOccurrencesResult.data || []) as ExistingOccurrenceRow[];
  const existingByScreeningKey = new Map<string, ExistingOccurrenceRow>();
  for (const occurrence of existingOccurrences) {
    const key = clean(metadataObject(occurrence.metadata).cinemaCatalogScreeningKey, 240);
    if (key) existingByScreeningKey.set(key, occurrence);
  }

  const activeKeys = new Set<string>();
  for (const screening of screenings) {
    activeKeys.add(screening.source_screening_key);
    const venue = venueByKey.get(screening.cinema_key);
    if (!venue) throw new Error("cinema_daily_publication_venue_relation_missing");
    const occurrencePayload = {
      event_id: eventId,
      venue_id: venue.id,
      starts_at: screening.starts_at,
      ends_at: screening.ends_at,
      timezone: screening.venue_timezone,
      room_label: screening.auditorium,
      status: "scheduled",
      sales_state: "unknown",
      occurrence_url: httpsUrl(screening.ticket_url) || httpsUrl(screening.source_url) || null,
      metadata: {
        task: "KINO000P",
        catalogMovieId: movie.id,
        cinemaCatalogScreeningKey: screening.source_screening_key,
        sourceId: screening.source_id,
        audioLanguage: screening.audio_language,
        subtitleLanguages: screening.subtitle_languages,
        versionType: screening.version_type,
        format: screening.format,
        screeningTags: screening.screening_tags,
      },
    };
    const existingOccurrence = existingByScreeningKey.get(screening.source_screening_key);
    if (existingOccurrence) {
      const update = await options.db.from("city_posters_occurrences").update(occurrencePayload).eq("id", existingOccurrence.id);
      if (update.error) throw new Error(`cinema_daily_publication_occurrence_update_failed:${update.error.code || "unknown"}`);
    } else {
      const insert = await options.db.from("city_posters_occurrences").insert(occurrencePayload);
      if (insert.error) throw new Error(`cinema_daily_publication_occurrence_create_failed:${insert.error.code || "unknown"}`);
    }
  }

  for (const occurrence of existingOccurrences) {
    const key = clean(metadataObject(occurrence.metadata).cinemaCatalogScreeningKey, 240);
    if (!key || activeKeys.has(key)) continue;
    const cancel = await options.db.from("city_posters_occurrences").update({ status: "cancelled" }).eq("id", occurrence.id);
    if (cancel.error) throw new Error(`cinema_daily_publication_occurrence_cancel_failed:${cancel.error.code || "unknown"}`);
  }

  const publish = await options.db.from("city_posters_events").update({
    status: "published",
    published_at: existing?.published_at || nowIso,
    metadata: eventMetadata,
  }).eq("id", eventId).in("status", ["ready", "published"]).select("id,status").single();

  if (publish.error || publish.data?.status !== "published") {
    throw new Error(`cinema_daily_publication_publish_failed:${publish.error?.code || "state_changed"}`);
  }

  const candidateUpdate = await options.db.from("cinema_catalog_movies").update({
    publication_state: "published",
    published_event_id: eventId,
    published_at: existing?.published_at || nowIso,
    updated_at: nowIso,
  }).eq("id", movie.id).eq("publication_state", "publishing").select("id").single();

  if (candidateUpdate.error || !candidateUpdate.data?.id) {
    throw new Error(`cinema_daily_publication_candidate_finalize_failed:${candidateUpdate.error?.code || "state_changed"}`);
  }

  const audit = await options.db.from("audit_log").insert({
    actor_user_key: options.actorUserKey,
    action: "cinema.compact_candidate_published",
    entity_type: "city_posters_event",
    entity_id: eventId,
    metadata: {
      task: "KINO000P",
      catalog_movie_id: movie.id,
      source_movie_key: movie.source_movie_key,
      city_id: movie.city_id,
      rank: movie.rank,
      screening_count: screenings.length,
      provider_distribution_authorized: true,
    },
  });
  if (audit.error) {
    console.warn("cinema_daily_publication_audit_failed", {
      catalogMovieId: movie.id,
      reason: String(audit.error.message || "unknown").slice(0, 160),
    });
  }

  const summary = {
    mode: "cinema_compact_city_posters_publication" as const,
    catalog_movie_id: movie.id,
    event_id: eventId,
    canonical_slug: slug,
    city_id: movie.city_id,
    source_movie_key: movie.source_movie_key,
    screening_count: screenings.length,
    occurrence_count: screenings.length,
    venue_count: venueByKey.size,
    publication_authorized: true,
    provider_distribution_authorized: true,
    telegram_auto_publish: true,
    idempotent: Boolean(existing?.id),
  };
  return summary;
  } catch (error) {
    await releaseClaim();
    throw error;
  }
}
