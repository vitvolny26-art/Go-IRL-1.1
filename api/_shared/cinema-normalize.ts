import { createHash } from "node:crypto";
import type {
  CinemaNormalizedScreening,
  CinemaParseResult,
  CinemaSourceConfig,
} from "./cinema-ingestion-types.js";

const cleanText = (value: string | null | undefined) => {
  if (typeof value !== "string") return null;
  const cleaned = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  return cleaned || null;
};

const cleanList = (value: string[] | undefined, limit = 20) =>
  [...new Set((value || [])
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item)))]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);

const languageAliases: Record<string, string> = {
  cs: "cs", cz: "cs", cze: "cs", cesky: "cs", "čeština": "cs", cestina: "cs",
  en: "en", eng: "en", english: "en",
  uk: "uk", ua: "uk", ukr: "uk", ukrainian: "uk", "українська": "uk",
  ru: "ru", rus: "ru", russian: "ru", "русский": "ru", "русская": "ru",
  pl: "pl", pol: "pl", polish: "pl", polski: "pl",
  sk: "sk", slk: "sk", slo: "sk", slovak: "sk", slovencina: "sk", "slovenčina": "sk",
  de: "de", ger: "de", deu: "de", german: "de", deutsch: "de",
  fr: "fr", fre: "fr", fra: "fr", french: "fr", francais: "fr", "français": "fr",
};

const normalizeLanguage = (value: string | null | undefined) => {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const key = cleaned.toLocaleLowerCase("und");
  return languageAliases[key] || (/^[a-z]{2}$/.test(key) ? key : null);
};

const normalizeVersionType = (value: string | null | undefined) => {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const key = cleaned.toLocaleLowerCase("und");
  if (/original|orig|ov|původn|puvodn/.test(key)) return "original";
  if (/dub|dab|dubbing|dabing/.test(key)) return "dubbed";
  if (/sub|titulk|subtitle/.test(key)) return "subtitled";
  if (/voice.?over|voiceover|namluv|jednohlas|dvouhlas/.test(key)) return "voiceover";
  return "unknown";
};

const normalizeFormat = (value: string | null | undefined) => {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const key = cleaned.toUpperCase().replace(/\s+/g, "");
  if (key.includes("IMAX")) return "IMAX";
  if (key.includes("D-BOX") || key.includes("DBOX")) return "D-BOX";
  if (key.includes("4K")) return "4K";
  if (key.includes("3D")) return "3D";
  if (key.includes("2D")) return "2D";
  return null;
};

const normalizeHttpsUrl = (value: string | null | undefined) => {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const canonicalHash = (prefix: string, parts: Array<string | number | null | undefined>) =>
  `${prefix}:sha256:${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;

const normalizeOptionalYear = (value: number | null) =>
  Number.isInteger(value) && Number(value) >= 1888 && Number(value) <= 2200 ? Number(value) : null;

const normalizeDuration = (value: number | null) =>
  Number.isFinite(value) && Number(value) > 0 && Number(value) <= 600 ? Math.round(Number(value)) : null;

export function normalizeCinemaScreening(
  source: CinemaSourceConfig,
  row: CinemaNormalizedScreening,
): CinemaNormalizedScreening {
  const rawLanguage = cleanText(row.raw_language) || cleanText(row.audio_language);
  const rawVersion = cleanText(row.raw_version) || cleanText(row.version_type);

  const title = cleanText(row.title) || "";
  const originalTitle = cleanText(row.original_title);
  const externalMovieId = cleanText(row.external_movie_id) || "";
  const externalScreeningId = cleanText(row.external_screening_id);
  const audioLanguage = normalizeLanguage(row.audio_language);
  const subtitleLanguages = cleanList(
    (row.subtitle_languages || [])
      .map((value) => normalizeLanguage(value))
      .filter((value): value is string => Boolean(value)),
    12,
  );
  const versionType = normalizeVersionType(row.version_type);
  const format = normalizeFormat(row.format);
  const screeningTags = cleanList(row.screening_tags, 20);
  const releaseYear = normalizeOptionalYear(row.release_year);
  const durationMinutes = normalizeDuration(row.duration_minutes);
  const startsAtLocal = cleanText(row.starts_at_local) || "";
  const timezone = cleanText(row.timezone) || source.timezone;
  const auditorium = cleanText(row.auditorium);

  const movieFingerprint = canonicalHash("movie", [
    source.source_id,
    externalMovieId,
    title.toLocaleLowerCase("und"),
    originalTitle?.toLocaleLowerCase("und") || null,
    releaseYear,
    durationMinutes,
  ]);
  const screeningFingerprint = canonicalHash("screening", [
    source.source_id,
    externalScreeningId,
    externalMovieId,
    startsAtLocal,
    timezone,
    format,
    audioLanguage,
    subtitleLanguages.join(","),
    versionType,
    auditorium,
  ]);

  return {
    ...row,
    external_screening_id: externalScreeningId,
    screening_fingerprint: screeningFingerprint,
    external_movie_id: externalMovieId,
    movie_fingerprint: movieFingerprint,
    title,
    original_title: originalTitle,
    release_year: releaseYear,
    duration_minutes: durationMinutes,
    poster_url: normalizeHttpsUrl(row.poster_url),
    genres: cleanList(row.genres, 12),
    countries: cleanList(row.countries, 12),
    original_language: normalizeLanguage(row.original_language),
    age_rating: cleanText(row.age_rating),
    description: cleanText(row.description),
    director: cleanText(row.director),
    lead_actors: cleanList(row.lead_actors, 12),
    starts_at_local: startsAtLocal,
    starts_at: cleanText(row.starts_at) || "",
    timezone,
    audio_language: audioLanguage,
    subtitle_languages: subtitleLanguages,
    audio_type: cleanText(row.audio_type),
    version_type: versionType,
    format,
    auditorium,
    screening_tags: screeningTags,
    ticket_url: normalizeHttpsUrl(row.ticket_url),
    source_url: normalizeHttpsUrl(row.source_url) || row.source_url,
    raw_language: rawLanguage,
    raw_version: rawVersion,
  };
}

export function normalizeCinemaParseResult(
  source: CinemaSourceConfig,
  parsed: CinemaParseResult,
): CinemaParseResult {
  const rows = parsed.rows.map((row) => normalizeCinemaScreening(source, row));
  const dates = rows
    .map((row) => /^\d{4}-\d{2}-\d{2}T/.test(row.starts_at_local) ? row.starts_at_local.slice(0, 10) : null)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    ...parsed,
    rows,
    records_valid: rows.length,
    min_schedule_date: dates[0] || null,
    max_schedule_date: dates.at(-1) || null,
    metrics: {
      ...parsed.metrics,
      normalize_contract_version: "kino000f-v1",
      normalized_rows: rows.length,
    },
  };
}
