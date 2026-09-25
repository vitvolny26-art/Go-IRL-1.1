import { readEnv } from "./env.js";
export type CinemaMovieEnrichmentRow = {
  id: string;
  title: string;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  genres: unknown;
  countries: unknown;
  original_language: string | null;
  age_rating: string | null;
  imdb_id: string | null;
  rating_status: string | null;
  poster_url: string | null;
  poster_source: string | null;
  synopsis_source: string | null;
  synopsis_generated: string | null;
  director: string | null;
  lead_actors: unknown;
  external_ids: unknown;
};

export type TmdbSearchMovieCandidate = {
  id: number;
  title?: string | null;
  original_title?: string | null;
  release_date?: string | null;
};

type TmdbReleaseDates = {
  results?: Array<{
    iso_3166_1?: string | null;
    release_dates?: Array<{
      certification?: string | null;
      type?: number | null;
    }>;
  }>;
};

export type TmdbMovieDetails = TmdbSearchMovieCandidate & {
  runtime?: number | null;
  genres?: Array<{ id?: number; name?: string | null }>;
  production_countries?: Array<{ iso_3166_1?: string | null; name?: string | null }>;
  original_language?: string | null;
  imdb_id?: string | null;
  poster_path?: string | null;
  overview?: string | null;
  release_dates?: TmdbReleaseDates;
  credits?: {
    crew?: Array<{ id?: number | null; job?: string | null; name?: string | null }>;
    cast?: Array<{
      id?: number | null;
      name?: string | null;
      order?: number | null;
    }>;
  };
};

type TmdbSearchResponse = {
  results?: TmdbSearchMovieCandidate[];
};

export type CinemaMovieEnrichmentResult =
  | { status: "not_configured"; provider: "tmdb" }
  | { status: "unavailable"; provider: "tmdb" }
  | { status: "ambiguous"; provider: "tmdb"; candidateIds: number[] }
  | { status: "matched"; provider: "tmdb"; tmdbId: number; update: Record<string, unknown> };

const tmdbApiBase = "https://api.themoviedb.org/3";
const tmdbImageBase = "https://image.tmdb.org/t/p/original";
const requestTimeoutMs = 15_000;

const normalizedTitle = (value: string | null | undefined) => (value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const releaseYear = (value: string | null | undefined) => {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value || "");
  return match ? Number(match[1]) : null;
};

const stringValue = (value: string | null | undefined) => {
  const output = String(value || "").trim();
  return output || null;
};

const jsonObject = (value: unknown) => (
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
);

const hasValues = (value: unknown) => Array.isArray(value) && value.length > 0;
const tmdbToken = () => stringValue(readEnv("TMDB_API_READ_ACCESS_TOKEN"));

export const cinemaMovieEnrichmentConfigured = () => Boolean(tmdbToken());

export const selectTmdbMovieCandidate = (
  movie: Pick<CinemaMovieEnrichmentRow, "title" | "original_title" | "release_year">,
  candidates: TmdbSearchMovieCandidate[],
) => {
  const expectedTitles = new Set(
    [movie.title, movie.original_title].map(normalizedTitle).filter(Boolean),
  );
  const matches = candidates.filter((candidate) => {
    const titleMatch = [candidate.title, candidate.original_title]
      .map(normalizedTitle)
      .some((title) => title && expectedTitles.has(title));
    if (!titleMatch) return false;
    if (!movie.release_year) return true;
    return releaseYear(candidate.release_date) === movie.release_year;
  });

  if (!matches.length) return { status: "unavailable" as const };
  if (matches.length > 1) {
    return {
      status: "ambiguous" as const,
      candidateIds: matches.map((candidate) => candidate.id).sort((a, b) => a - b),
    };
  }
  return { status: "matched" as const, candidate: matches[0] };
};

const fetchTmdbJson = async <T>(url: URL, token: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new Error(`tmdb_http_${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
};

const searchTmdbMovie = async (
  query: string,
  year: number | null,
  token: string,
) => {
  const url = new URL(`${tmdbApiBase}/search/movie`);
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  if (year) url.searchParams.set("year", String(year));
  const payload = await fetchTmdbJson<TmdbSearchResponse>(url, token);
  return payload.results || [];
};

const loadTmdbMovie = async (id: number, token: string) => {
  const url = new URL(`${tmdbApiBase}/movie/${id}`);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("append_to_response", "release_dates,credits");
  return fetchTmdbJson<TmdbMovieDetails>(url, token);
};

const certification = (details: TmdbMovieDetails) => {
  const results = details.release_dates?.results || [];
  for (const country of ["CZ", "US"]) {
    const releases = results.find((item) => String(item.iso_3166_1 || "").toUpperCase() === country)
      ?.release_dates || [];
    const ranked = [...releases].sort((left, right) => {
      const order = [3, 2, 1, 4, 5, 6];
      const leftRank = order.indexOf(Number(left.type || 0));
      const rightRank = order.indexOf(Number(right.type || 0));
      return (leftRank < 0 ? 99 : leftRank) - (rightRank < 0 ? 99 : rightRank);
    });
    const value = ranked.map((item) => stringValue(item.certification)).find(Boolean);
    if (value) return value;
  }
  return null;
};

export const buildCinemaMovieEnrichmentUpdate = (
  movie: CinemaMovieEnrichmentRow,
  details: TmdbMovieDetails,
) => {
  const update: Record<string, unknown> = {};
  const originalTitle = stringValue(details.original_title);
  const year = releaseYear(details.release_date);
  const runtime = Number(details.runtime || 0);
  const genres = (details.genres || []).map((item) => stringValue(item.name)).filter(Boolean);
  const countries = (details.production_countries || [])
    .map((item) => stringValue(item.iso_3166_1)?.toUpperCase())
    .filter(Boolean);
  const originalLanguage = stringValue(details.original_language)?.toLowerCase() || null;
  const imdbId = stringValue(details.imdb_id);
  const ageRating = certification(details);
  const overview = stringValue(details.overview);
  const director = (details.credits?.crew || [])
    .find((member) => String(member.job || "").trim().toLowerCase() === "director");
  const directorName = stringValue(director?.name);
  const leadActors = [...(details.credits?.cast || [])]
    .sort((left, right) => Number(left.order ?? Number.MAX_SAFE_INTEGER) - Number(right.order ?? Number.MAX_SAFE_INTEGER))
    .map((member) => stringValue(member.name))
    .filter((name): name is string => Boolean(name))
    .slice(0, 5);
  const posterUrl = details.poster_path
    ? `${tmdbImageBase}${details.poster_path.startsWith("/") ? details.poster_path : `/${details.poster_path}`}`
    : null;

  if (!movie.original_title && originalTitle) update.original_title = originalTitle;
  if (!movie.release_year && year) update.release_year = year;
  if (!movie.duration_minutes && Number.isFinite(runtime) && runtime > 0) update.duration_minutes = Math.round(runtime);
  if (!hasValues(movie.genres) && genres.length) update.genres = genres;
  if (!hasValues(movie.countries) && countries.length) update.countries = countries;
  if (!movie.original_language && originalLanguage) update.original_language = originalLanguage;
  if (!movie.age_rating && ageRating) update.age_rating = ageRating;
  if (!movie.director && directorName) update.director = directorName;
  if (!hasValues(movie.lead_actors) && leadActors.length) update.lead_actors = leadActors;

  if (!movie.imdb_id && imdbId) update.imdb_id = imdbId;
  if (imdbId && (movie.rating_status === null || movie.rating_status === "unknown")) {
    update.rating_status = "pending";
  }

  if (posterUrl && (!movie.poster_url || !movie.poster_source || movie.poster_source === "tmdb")) {
    update.poster_url = posterUrl;
    update.poster_source = "tmdb";
  }

  if (overview && (!movie.synopsis_generated || movie.synopsis_source === "tmdb")) {
    update.synopsis_generated = overview;
    update.synopsis_source = "tmdb";
  }

  const externalIds = jsonObject(movie.external_ids);
  if (externalIds.tmdb !== details.id) {
    update.external_ids = { ...externalIds, tmdb: details.id };
  }

  if (Object.keys(update).length) update.updated_at = new Date().toISOString();
  return update;
};

export async function enrichCinemaMovieFromTmdb(
  movie: CinemaMovieEnrichmentRow,
): Promise<CinemaMovieEnrichmentResult> {
  const token = tmdbToken();
  if (!token) return { status: "not_configured", provider: "tmdb" };

  const queries = [...new Set([movie.original_title, movie.title].map(stringValue).filter(Boolean))] as string[];
  const candidates = new Map<number, TmdbSearchMovieCandidate>();
  for (const query of queries) {
    for (const candidate of await searchTmdbMovie(query, movie.release_year, token)) {
      candidates.set(candidate.id, candidate);
    }
  }

  const selected = selectTmdbMovieCandidate(movie, [...candidates.values()]);
  if (selected.status === "unavailable") return { status: "unavailable", provider: "tmdb" };
  if (selected.status === "ambiguous") {
    return { status: "ambiguous", provider: "tmdb", candidateIds: selected.candidateIds };
  }

  const details = await loadTmdbMovie(selected.candidate.id, token);
  return {
    status: "matched",
    provider: "tmdb",
    tmdbId: details.id,
    update: buildCinemaMovieEnrichmentUpdate(movie, details),
  };
}
