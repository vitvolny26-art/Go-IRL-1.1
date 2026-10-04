import type { SupabaseClient } from "@supabase/supabase-js";

export const cinemaDailyPublicationLanguages = ["ru", "uk", "cs", "en", "pl", "sk"] as const;
export type CinemaDailyPublicationLanguage = typeof cinemaDailyPublicationLanguages[number];

export type CinemaDailyPublicationTranslation = {
  title: string;
  description: string;
};

export type CinemaDailyPublicationInput = {
  candidateId: string;
  expected: {
    movieId: string;
    cityId: string;
    showingFrom: string;
    showingUntil: string;
    score: number;
  };
  poster: {
    url: string;
    sourceUrl: string;
    rightsStatus: string;
  };
  translations: Record<CinemaDailyPublicationLanguage, CinemaDailyPublicationTranslation>;
};

type CandidateRow = {
  id: string;
  movie_id: string;
  city_id: string;
  city_name: string;
  title: string;
  showing_from: string;
  showing_until: string;
  screening_count: number;
  day_count: number;
  score: number;
  priority: string;
  lifecycle_status: string;
  decision_status: string;
};

type MovieRow = {
  id: string;
  title: string;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  age_rating: string | null;
  synopsis_generated: string | null;
  synopsis_source: string | null;
};

type CinemaVenueRow = {
  id: string;
  city_id: string;
  city_name: string;
  name: string;
  slug: string;
  venue_type: string;
  address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  website_url: string | null;
  schedule_url: string | null;
  timezone: string;
  active: boolean;
};

type ScreeningRow = {
  id: string;
  movie_id: string;
  cinema_id: string;
  starts_at: string;
  ends_at: string | null;
  auditorium: string | null;
  ticket_url: string | null;
  source_url: string | null;
  source_id: string | null;
  status: string;
  cinema_venues: CinemaVenueRow | CinemaVenueRow[] | null;
};

type ExistingEventRow = {
  id: string;
  status: string;
  published_at: string | null;
  metadata: Record<string, unknown> | null;
};

type ExistingOccurrenceRow = {
  id: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

export type CinemaDailyPublicationSummary = {
  mode: "cinema_daily_city_posters_publication";
  candidate_id: string;
  event_id: string;
  canonical_slug: string;
  city_id: string;
  movie_id: string;
  screening_count: number;
  occurrence_count: number;
  venue_count: number;
  publication_authorized: true;
  provider_distribution_authorized: true;
  telegram_auto_publish: true;
  idempotent: boolean;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const validCityId = (value: string) => /^[a-z0-9_-]{1,80}$/.test(value);
const publishablePosterStatuses = new Set(["ok", "cached", "generated"]);
const clean = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const single = <T>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

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

const localDate = (startsAt: string, timeZone: string) => {
  const instant = new Date(startsAt);
  if (!Number.isFinite(instant.getTime())) throw new Error("cinema_daily_publication_starts_at_invalid");
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
  } catch {
    throw new Error("cinema_daily_publication_timezone_invalid");
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) throw new Error("cinema_daily_publication_local_date_invalid");
  return `${values.year}-${values.month}-${values.day}`;
};

const metadataObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const cinemaDailyMetadata = (value: unknown): Record<string, unknown> => {
  const metadata = metadataObject(value);
  return metadataObject(metadata.cinemaDaily);
};

export function validateCinemaDailyPublicationInput(input: CinemaDailyPublicationInput) {
  if (!input || typeof input !== "object" || !input.expected || !input.poster || !input.translations) {
    throw new Error("cinema_daily_publication_body_invalid");
  }
  if (!uuid.test(input.candidateId)) throw new Error("cinema_daily_publication_candidate_id_invalid");
  if (!uuid.test(input.expected.movieId)) throw new Error("cinema_daily_publication_movie_id_invalid");
  if (!validCityId(input.expected.cityId)) throw new Error("cinema_daily_publication_city_id_invalid");
  if (!dateOnly.test(input.expected.showingFrom) || !dateOnly.test(input.expected.showingUntil)) {
    throw new Error("cinema_daily_publication_window_invalid");
  }
  if (input.expected.showingUntil < input.expected.showingFrom) throw new Error("cinema_daily_publication_window_invalid");
  if (!Number.isInteger(input.expected.score) || input.expected.score < 0) throw new Error("cinema_daily_publication_score_invalid");

  const posterUrl = httpsUrl(input.poster.url);
  const posterSourceUrl = httpsUrl(input.poster.sourceUrl);
  const posterRightsStatus = clean(input.poster.rightsStatus, 80);
  if (!posterUrl || !posterSourceUrl || !publishablePosterStatuses.has(posterRightsStatus)) {
    throw new Error("cinema_daily_publication_poster_invalid");
  }

  for (const language of cinemaDailyPublicationLanguages) {
    const translation = input.translations?.[language];
    if (!translation || !clean(translation.title, 180) || !clean(translation.description, 4_000)) {
      throw new Error(`cinema_daily_publication_translation_missing:${language}`);
    }
  }
  return { posterUrl, posterSourceUrl, posterRightsStatus };
}

const ensureVenue = async (db: SupabaseClient, venue: CinemaVenueRow) => {
  const slug = `cinema-${slugify(venue.slug || venue.name, 56) || venue.id.slice(0, 8)}`;
  const existing = await db.from("city_posters_venues")
    .select("id,metadata")
    .eq("city_id", venue.city_id)
    .eq("slug", slug)
    .maybeSingle();
  if (existing.error) throw new Error(`cinema_daily_publication_venue_lookup_failed:${existing.error.code || "unknown"}`);

  const current = existing.data as { id?: string; metadata?: Record<string, unknown> | null } | null;
  if (current?.id) {
    const currentMetadata = metadataObject(current.metadata);
    if (currentMetadata.cinemaVenueId && currentMetadata.cinemaVenueId !== venue.id) {
      throw new Error("cinema_daily_publication_venue_slug_collision");
    }
    const update = await db.from("city_posters_venues").update({
      canonical_name: venue.name,
      aliases: [],
      venue_type: "cinema",
      address: venue.address,
      lat: venue.lat,
      lng: venue.lng,
      timezone: venue.timezone,
      official_url: venue.website_url || venue.schedule_url,
      active: venue.active,
      metadata: { ...currentMetadata, source: "cinema_venues", cinemaVenueId: venue.id },
    }).eq("id", current.id);
    if (update.error) throw new Error(`cinema_daily_publication_venue_update_failed:${update.error.code || "unknown"}`);
    return String(current.id);
  }

  const inserted = await db.from("city_posters_venues").insert({
    city_id: venue.city_id,
    canonical_name: venue.name,
    slug,
    aliases: [],
    venue_type: "cinema",
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    timezone: venue.timezone,
    official_url: venue.website_url || venue.schedule_url,
    active: venue.active,
    metadata: { source: "cinema_venues", cinemaVenueId: venue.id },
  }).select("id").single();
  if (inserted.error || !inserted.data?.id) {
    throw new Error(`cinema_daily_publication_venue_create_failed:${inserted.error?.code || "unknown"}`);
  }
  return String(inserted.data.id);
};

const eventSlug = (candidate: CandidateRow) => {
  const title = slugify(candidate.title, 44) || "movie";
  return `cinema-${title}-${candidate.movie_id.slice(0, 8)}-${candidate.showing_from.replaceAll("-", "")}-${candidate.showing_until.replaceAll("-", "")}`;
};

const targetWindowScreenings = (candidate: CandidateRow, rows: ScreeningRow[]) => rows.filter((row) => {
  const venue = single(row.cinema_venues);
  if (!venue || venue.city_id !== candidate.city_id || !venue.active || row.status !== "scheduled") return false;
  const date = localDate(row.starts_at, venue.timezone);
  return date >= candidate.showing_from && date <= candidate.showing_until;
});

export async function materializeApprovedDailyCinemaCandidate(options: {
  db: SupabaseClient;
  input: CinemaDailyPublicationInput;
  actorUserKey: string;
  now?: Date;
}): Promise<CinemaDailyPublicationSummary> {
  const { posterUrl, posterSourceUrl, posterRightsStatus } = validateCinemaDailyPublicationInput(options.input);
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("cinema_daily_publication_now_invalid");
  const nowIso = now.toISOString();

  const candidateResult = await options.db.from("cinema_daily_movie_city_candidates")
    .select("id,movie_id,city_id,city_name,title,showing_from,showing_until,screening_count,day_count,score,priority,lifecycle_status,decision_status")
    .eq("id", options.input.candidateId)
    .single();
  if (candidateResult.error || !candidateResult.data) {
    throw new Error(`cinema_daily_publication_candidate_load_failed:${candidateResult.error?.code || "not_found"}`);
  }
  const candidate = candidateResult.data as CandidateRow;
  const expected = options.input.expected;
  if (
    candidate.movie_id !== expected.movieId
    || candidate.city_id !== expected.cityId
    || candidate.showing_from !== expected.showingFrom
    || candidate.showing_until !== expected.showingUntil
    || candidate.score !== expected.score
  ) throw new Error("cinema_daily_publication_identity_mismatch");
  if (candidate.lifecycle_status !== "active" || candidate.decision_status !== "approved") {
    throw new Error("cinema_daily_publication_candidate_not_approved");
  }

  const movieResult = await options.db.from("cinema_movies")
    .select("id,title,original_title,release_year,duration_minutes,age_rating,synopsis_generated,synopsis_source")
    .eq("id", candidate.movie_id)
    .single();
  if (movieResult.error || !movieResult.data) {
    throw new Error(`cinema_daily_publication_movie_load_failed:${movieResult.error?.code || "not_found"}`);
  }
  const movie = movieResult.data as MovieRow;

  const screeningResult = await options.db.from("cinema_screenings")
    .select("id,movie_id,cinema_id,starts_at,ends_at,auditorium,ticket_url,source_url,source_id,status,cinema_venues!inner(id,city_id,city_name,name,slug,venue_type,address,lat,lng,website_url,schedule_url,timezone,active)")
    .eq("movie_id", candidate.movie_id)
    .eq("cinema_venues.city_id", candidate.city_id)
    .eq("cinema_venues.active", true)
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true });
  if (screeningResult.error) {
    throw new Error(`cinema_daily_publication_screenings_load_failed:${screeningResult.error.code || "unknown"}`);
  }
  const screenings = targetWindowScreenings(candidate, (screeningResult.data || []) as unknown as ScreeningRow[]);
  const dayCount = new Set(screenings.map((row) => {
    const venue = single(row.cinema_venues);
    if (!venue) throw new Error("cinema_daily_publication_venue_relation_missing");
    return localDate(row.starts_at, venue.timezone);
  })).size;
  if (screenings.length !== candidate.screening_count || dayCount !== candidate.day_count) {
    throw new Error("cinema_daily_publication_schedule_changed");
  }
  if (!screenings.length) throw new Error("cinema_daily_publication_no_screenings");

  const venueByCinemaId = new Map<string, CinemaVenueRow>();
  for (const row of screenings) {
    const venue = single(row.cinema_venues);
    if (!venue) throw new Error("cinema_daily_publication_venue_relation_missing");
    venueByCinemaId.set(row.cinema_id, venue);
  }
  const cityPosterVenueIds = new Map<string, string>();
  for (const [cinemaId, venue] of venueByCinemaId) {
    cityPosterVenueIds.set(cinemaId, await ensureVenue(options.db, venue));
  }

  const slug = eventSlug(candidate);
  const existingResult = await options.db.from("city_posters_events")
    .select("id,status,published_at,metadata")
    .eq("city_id", candidate.city_id)
    .eq("canonical_slug", slug)
    .maybeSingle();
  if (existingResult.error) throw new Error(`cinema_daily_publication_event_lookup_failed:${existingResult.error.code || "unknown"}`);
  const existing = (existingResult.data || null) as ExistingEventRow | null;
  const existingDaily = cinemaDailyMetadata(existing?.metadata);
  if (existing?.id && existingDaily.candidateId !== candidate.id) {
    throw new Error("cinema_daily_publication_event_slug_collision");
  }
  if (existing?.id && !["ready", "published"].includes(existing.status)) {
    throw new Error("cinema_daily_publication_event_state_conflict");
  }
  if (existing?.id) {
    const telegram = await options.db.from("city_posters_telegram_publications")
      .select("event_id")
      .eq("event_id", existing.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (telegram.error) throw new Error(`cinema_daily_publication_provider_lookup_failed:${telegram.error.code || "unknown"}`);
    if (telegram.data) throw new Error("cinema_daily_publication_provider_already_distributed");
  }

  const venueNames = [...new Set([...venueByCinemaId.values()].map((venue) => venue.name))];
  const primaryVenueId = cityPosterVenueIds.size === 1 ? [...cityPosterVenueIds.values()][0] : null;
  const firstOfficialSource = screenings.map((row) => httpsUrl(row.ticket_url) || httpsUrl(row.source_url)).find(Boolean) || "";
  const eventMetadata = {
    ...metadataObject(existing?.metadata),
    task: "AFISHI000A",
    created_via: "cinema_daily_candidate_publication",
    official_source: firstOfficialSource || posterSourceUrl,
    telegram_auto_publish: true,
    telegram_topic_kind: "culture",
    provider_distribution: { telegram: "automatic" },
    poster: {
      source_url: posterSourceUrl,
      rights_status: posterRightsStatus,
      provenance: "publication_input",
    },
    cinemaDaily: {
      candidateId: candidate.id,
      publicationKey: `cinema-daily:${candidate.id}`,
      movieId: candidate.movie_id,
      cityId: candidate.city_id,
      showingFrom: candidate.showing_from,
      showingUntil: candidate.showing_until,
      score: candidate.score,
      priority: candidate.priority,
      screeningCount: candidate.screening_count,
      dayCount: candidate.day_count,
    },
  };

  let eventId = existing?.id || "";
  if (eventId) {
    const update = await options.db.from("city_posters_events").update({
      vertical: "cinema",
      subcategory: "movie",
      organizer_name: venueNames.join(", ").slice(0, 240),
      primary_venue_id: primaryVenueId,
      hero_media_url: posterUrl,
      original_language: "cs",
      metadata: eventMetadata,
      status: existing?.status === "published" ? "published" : "ready",
      published_at: existing?.status === "published" ? existing.published_at : null,
    }).eq("id", eventId);
    if (update.error) throw new Error(`cinema_daily_publication_event_update_failed:${update.error.code || "unknown"}`);
  } else {
    const insert = await options.db.from("city_posters_events").insert({
      vertical: "cinema",
      subcategory: "movie",
      city_id: candidate.city_id,
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
    }).select("id").single();
    if (insert.error || !insert.data?.id) {
      throw new Error(`cinema_daily_publication_event_create_failed:${insert.error?.code || "unknown"}`);
    }
    eventId = String(insert.data.id);
  }

  const translations = cinemaDailyPublicationLanguages.map((language) => ({
    event_id: eventId,
    language,
    title: clean(options.input.translations[language].title, 180),
    description: clean(options.input.translations[language].description, 4_000),
    source_kind: "machine",
    verified: false,
  }));
  const translationWrite = await options.db.from("city_posters_event_translations")
    .upsert(translations, { onConflict: "event_id,language" });
  if (translationWrite.error) {
    throw new Error(`cinema_daily_publication_translation_write_failed:${translationWrite.error.code || "unknown"}`);
  }

  const existingOccurrencesResult = await options.db.from("city_posters_occurrences")
    .select("id,status,metadata")
    .eq("event_id", eventId);
  if (existingOccurrencesResult.error) {
    throw new Error(`cinema_daily_publication_occurrence_lookup_failed:${existingOccurrencesResult.error.code || "unknown"}`);
  }
  const existingOccurrences = (existingOccurrencesResult.data || []) as ExistingOccurrenceRow[];
  const occurrenceByScreeningId = new Map<string, ExistingOccurrenceRow>();
  for (const occurrence of existingOccurrences) {
    const metadata = metadataObject(occurrence.metadata);
    const screeningId = clean(metadata.cinemaDailyScreeningId, 80);
    if (screeningId) occurrenceByScreeningId.set(screeningId, occurrence);
  }

  const currentScreeningIds = new Set<string>();
  for (const screening of screenings) {
    currentScreeningIds.add(screening.id);
    const venue = single(screening.cinema_venues);
    if (!venue) throw new Error("cinema_daily_publication_venue_relation_missing");
    const occurrencePayload = {
      event_id: eventId,
      venue_id: cityPosterVenueIds.get(screening.cinema_id) || null,
      starts_at: screening.starts_at,
      ends_at: screening.ends_at,
      timezone: venue.timezone,
      room_label: screening.auditorium,
      status: "scheduled",
      sales_state: "unknown",
      occurrence_url: httpsUrl(screening.ticket_url) || httpsUrl(screening.source_url) || httpsUrl(venue.schedule_url) || httpsUrl(venue.website_url) || null,
      metadata: {
        task: "AFISHI000A",
        candidateId: candidate.id,
        cinemaDailyScreeningId: screening.id,
        sourceId: screening.source_id,
      },
    };
    const occurrence = occurrenceByScreeningId.get(screening.id);
    if (occurrence) {
      const update = await options.db.from("city_posters_occurrences").update(occurrencePayload).eq("id", occurrence.id);
      if (update.error) throw new Error(`cinema_daily_publication_occurrence_update_failed:${update.error.code || "unknown"}`);
    } else {
      const insert = await options.db.from("city_posters_occurrences").insert(occurrencePayload);
      if (insert.error) throw new Error(`cinema_daily_publication_occurrence_create_failed:${insert.error.code || "unknown"}`);
    }
  }

  for (const occurrence of existingOccurrences) {
    const metadata = metadataObject(occurrence.metadata);
    const screeningId = clean(metadata.cinemaDailyScreeningId, 80);
    if (!screeningId || currentScreeningIds.has(screeningId)) continue;
    if (metadata.candidateId !== candidate.id) continue;
    const cancel = await options.db.from("city_posters_occurrences").update({ status: "cancelled" }).eq("id", occurrence.id);
    if (cancel.error) throw new Error(`cinema_daily_publication_occurrence_cancel_failed:${cancel.error.code || "unknown"}`);
  }

  const publish = await options.db.from("city_posters_events").update({
    status: "published",
    published_at: existing?.published_at || nowIso,
    metadata: eventMetadata,
  })
    .eq("id", eventId)
    .in("status", ["ready", "published"])
    .select("id,status")
    .single();
  if (publish.error || publish.data?.status !== "published") {
    throw new Error(`cinema_daily_publication_publish_failed:${publish.error?.code || "state_changed"}`);
  }

  const audit = await options.db.from("audit_log").insert({
    actor_user_key: options.actorUserKey,
    action: "cinema.daily_candidate_published",
    entity_type: "city_posters_event",
    entity_id: eventId,
    metadata: {
      task: "AFISHI000A",
      candidate_id: candidate.id,
      movie_id: candidate.movie_id,
      city_id: candidate.city_id,
      showing_from: candidate.showing_from,
      showing_until: candidate.showing_until,
      score: candidate.score,
      provider_distribution_authorized: true,
    },
  });
  if (audit.error) {
    console.warn("cinema_daily_publication_audit_failed", {
      candidateId: candidate.id,
      reason: String(audit.error.message || "unknown").slice(0, 160),
    });
  }

  return {
    mode: "cinema_daily_city_posters_publication",
    candidate_id: candidate.id,
    event_id: eventId,
    canonical_slug: slug,
    city_id: candidate.city_id,
    movie_id: candidate.movie_id,
    screening_count: candidate.screening_count,
    occurrence_count: screenings.length,
    venue_count: venueByCinemaId.size,
    publication_authorized: true,
    provider_distribution_authorized: true,
    telegram_auto_publish: true,
    idempotent: Boolean(existing?.id),
  };
}
