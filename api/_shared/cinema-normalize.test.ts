import { describe, expect, it } from "vitest";
import type { CinemaNormalizedScreening, CinemaParseResult, CinemaSourceConfig } from "./cinema-ingestion-types.js";
import { normalizeCinemaParseResult, normalizeCinemaScreening } from "./cinema-normalize.js";

const source: CinemaSourceConfig = {
  id: "source",
  venue_id: "venue",
  source_id: "cinema-source",
  adapter_key: "adapter",
  source_url: "https://example.com/",
  fetch_method: "html",
  parser_version: "1",
  timezone: "Europe/Prague",
  enabled: true,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 5,
  min_records: 1,
  config: {},
};

const row = (overrides: Partial<CinemaNormalizedScreening> = {}): CinemaNormalizedScreening => ({
  external_screening_id: " screening-1 ",
  screening_fingerprint: "adapter-value",
  external_movie_id: " movie-1 ",
  movie_fingerprint: "adapter-movie",
  title: "  Žlutý   film  ",
  original_title: " Yellow Film ",
  release_year: 2026,
  duration_minutes: 119.6,
  poster_url: "https://example.com/poster.jpg",
  genres: [" Drama ", "Drama"],
  countries: [" CZ ", "CZ"],
  original_language: "CZE",
  age_rating: " 12+ ",
  description: "  Popis   filmu ",
  director: " Director ",
  lead_actors: [" Actor B ", "Actor A", "Actor A"],
  starts_at_local: "2026-10-10T20:00:00",
  starts_at: "2026-10-10T18:00:00.000Z",
  timezone: "Europe/Prague",
  audio_language: "čeština",
  subtitle_languages: ["ENG", "en", " українська "],
  audio_type: " Dolby Atmos ",
  version_type: " s titulky ",
  format: " 3d ",
  auditorium: " Hall 1 ",
  screening_tags: [" D-BOX ", "Dolby", "D-BOX"],
  ticket_url: "https://example.com/ticket",
  source_url: "https://example.com/program",
  raw_language: null,
  raw_version: null,
  ...overrides,
});

describe("Kino000F normalization contract", () => {
  it("canonicalizes text, languages, arrays, version type, format, and URLs", () => {
    const normalized = normalizeCinemaScreening(source, row());

    expect(normalized).toEqual(expect.objectContaining({
      external_movie_id: "movie-1",
      external_screening_id: "screening-1",
      title: "Žlutý film",
      original_title: "Yellow Film",
      duration_minutes: 120,
      original_language: "cs",
      audio_language: "cs",
      subtitle_languages: ["en", "uk"],
      version_type: "subtitled",
      format: "3D",
      screening_tags: ["D-BOX", "Dolby"],
      genres: ["Drama"],
      countries: ["CZ"],
      director: "Director",
      lead_actors: ["Actor A", "Actor B"],
      raw_language: "čeština",
      raw_version: "s titulky",
    }));
  });

  it("keeps Ukrainian and Russian distinct", () => {
    expect(normalizeCinemaScreening(source, row({ audio_language: "UKR" })).audio_language).toBe("uk");
    expect(normalizeCinemaScreening(source, row({ audio_language: "RUS" })).audio_language).toBe("ru");
  });

  it("maps unknown non-empty versions to unknown without guessing", () => {
    const normalized = normalizeCinemaScreening(source, row({ version_type: "special mystery mix" }));
    expect(normalized.version_type).toBe("unknown");
    expect(normalized.raw_version).toBe("special mystery mix");
  });

  it("nulls invalid optional HTTPS URLs instead of preserving invalid values", () => {
    const normalized = normalizeCinemaScreening(source, row({
      poster_url: "http://example.com/poster.jpg",
      ticket_url: "not-a-url",
    }));
    expect(normalized.poster_url).toBeNull();
    expect(normalized.ticket_url).toBeNull();
  });

  it("produces deterministic fingerprints from canonical identity", () => {
    const left = normalizeCinemaScreening(source, row());
    const right = normalizeCinemaScreening(source, row({
      title: "Žlutý film",
      audio_language: "CZ",
      subtitle_languages: ["ukr", "English"],
      version_type: "subtitles",
      format: "3D",
      screening_tags: ["Dolby", "D-BOX"],
    }));

    expect(left.movie_fingerprint).toBe(right.movie_fingerprint);
    expect(left.screening_fingerprint).toBe(right.screening_fingerprint);
    expect(left.movie_fingerprint).toMatch(/^movie:sha256:[a-f0-9]{64}$/);
    expect(left.screening_fingerprint).toMatch(/^screening:sha256:[a-f0-9]{64}$/);
  });

  it("recomputes normalized date bounds and preserves parse evidence", () => {
    const parsed: CinemaParseResult = {
      rows: [row(), row({ external_screening_id: "screening-2", starts_at_local: "2026-10-12T20:00:00" })],
      records_parsed: 2,
      records_valid: 2,
      records_rejected: 0,
      min_schedule_date: "wrong",
      max_schedule_date: "wrong",
      expected_until: "2026-10-12",
      fetch_complete: true,
      parser_complete: true,
      scope_complete: true,
      fatal_error: false,
      zero_result: false,
      errors: [],
      metrics: { adapter: true },
    };

    const normalized = normalizeCinemaParseResult(source, parsed);
    expect(normalized.min_schedule_date).toBe("2026-10-10");
    expect(normalized.max_schedule_date).toBe("2026-10-12");
    expect(normalized.metrics).toEqual(expect.objectContaining({
      adapter: true,
      normalize_contract_version: "kino000f-v1",
      normalized_rows: 2,
    }));
  });
});
