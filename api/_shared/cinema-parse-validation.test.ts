import { describe, expect, it } from "vitest";
import type {
  CinemaNormalizedScreening,
  CinemaParseResult,
  CinemaSourceConfig,
} from "./cinema-ingestion-types.js";
import { validateCinemaParseResult } from "./cinema-parse-validation.js";

const source: CinemaSourceConfig = {
  id: "source",
  venue_id: "venue",
  source_id: "premiere_cinemas_cz",
  adapter_key: "premiere_cz",
  source_url: "https://olomouc.premierecinemas.cz/",
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
  external_screening_id: "screening-1",
  screening_fingerprint: "fp-1",
  external_movie_id: "movie-1",
  movie_fingerprint: "movie-fp-1",
  title: "Film",
  original_title: "Film",
  release_year: 2026,
  duration_minutes: 120,
  starts_at_local: "2026-10-10T20:00:00",
  starts_at: "2026-10-10T18:00:00.000Z",
  timezone: "Europe/Prague",
  audio_language: "cs",
  subtitle_languages: [],
  audio_type: null,
  version_type: null,
  format: "2D",
  auditorium: null,
  screening_tags: [],
  ticket_url: "https://example.com/ticket",
  source_url: "https://example.com/program",
  raw_language: null,
  raw_version: null,
  ...overrides,
});

const parsed = (overrides: Partial<CinemaParseResult> = {}): CinemaParseResult => ({
  rows: [row()],
  records_parsed: 1,
  records_valid: 1,
  records_rejected: 0,
  min_schedule_date: "2026-10-10",
  max_schedule_date: "2026-10-10",
  expected_until: "2026-10-10",
  fetch_complete: true,
  parser_complete: true,
  scope_complete: true,
  fatal_error: false,
  zero_result: false,
  errors: [],
  metrics: {},
  ...overrides,
});

describe("Kino000E parse/source validation", () => {
  it("accepts a complete internally consistent parse", () => {
    expect(validateCinemaParseResult(source, parsed())).toEqual(expect.objectContaining({
      scopeComplete: true,
      status: "success",
      issues: [],
      errorMessage: null,
    }));
  });

  it("quarantines partial fetches and adapter scope contradictions", () => {
    const result = validateCinemaParseResult(source, parsed({ fetch_complete: false, scope_complete: true }));
    expect(result.scopeComplete).toBe(false);
    expect(result.issues).toContain("scope_complete_contract_mismatch");
  });

  it("quarantines zero-result parses", () => {
    const result = validateCinemaParseResult(source, parsed({
      rows: [],
      records_parsed: 0,
      records_valid: 0,
      min_schedule_date: null,
      max_schedule_date: null,
      zero_result: true,
      scope_complete: false,
    }));
    expect(result.scopeComplete).toBe(false);
  });

  it("quarantines insufficient records and insufficient horizon", () => {
    const strictSource = { ...source, min_records: 2 };
    const result = validateCinemaParseResult(strictSource, parsed({ scope_complete: false, expected_until: "2026-10-11" }));
    expect(result.scopeComplete).toBe(false);
    expect(result.metrics).toEqual(expect.objectContaining({
      enough_records: false,
      horizon_covered: false,
    }));
  });

  it("quarantines duplicate screening fingerprints", () => {
    const rows = [row(), row({ external_screening_id: "screening-2" })];
    const result = validateCinemaParseResult(source, parsed({
      rows,
      records_parsed: 2,
      records_valid: 2,
      scope_complete: false,
    }));
    expect(result.issues).toContain("duplicate_screening_fingerprint");
  });

  it("quarantines malformed timestamps and records row-level evidence", () => {
    const result = validateCinemaParseResult(source, parsed({
      rows: [row({ starts_at_local: "bad-time" })],
      min_schedule_date: null,
      max_schedule_date: null,
      scope_complete: false,
    }));
    expect(result.rowValidationErrors[0]).toContain("starts_at_local_invalid");
    expect(result.issues).toContain("row_validation_failed");
  });

  it("quarantines mismatched counters", () => {
    const result = validateCinemaParseResult(source, parsed({
      records_parsed: 5,
      records_valid: 2,
      records_rejected: 0,
      scope_complete: false,
    }));
    expect(result.issues).toContain("records_valid_row_count_mismatch");
    expect(result.issues).toContain("records_parsed_total_mismatch");
  });

  it("quarantines fatal parser errors", () => {
    const result = validateCinemaParseResult(source, parsed({ fatal_error: true, scope_complete: false }));
    expect(result.issues).toContain("fatal_error");
    expect(result.scopeComplete).toBe(false);
  });
});
