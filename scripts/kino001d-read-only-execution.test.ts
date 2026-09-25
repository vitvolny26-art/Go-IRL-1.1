import { describe, expect, it } from "vitest";
import type { CinemaAdapter, CinemaNormalizedScreening, CinemaParseResult } from "../api/_shared/cinema-ingestion-types.js";
import {
  buildDailySheetPayload,
  executeReadOnlyPlan,
  executeReadOnlySource,
  toCinemaSourceConfig,
  type ReadOnlyExecutionPlan,
} from "./kino001d-read-only-execution.js";

const executable = {
  source_id: "uk_kyiv_planetakino",
  adapter_key: "planeta_kino_ua",
  status: "executable" as const,
  official_source_url: "https://planetakino.ua/schedule/?cinema=cinema-1-uk",
};

const screening: CinemaNormalizedScreening = {
  external_screening_id: "screening-1",
  screening_fingerprint: "h12345678",
  external_movie_id: "movie-1",
  movie_fingerprint: "m12345678",
  title: "Film",
  original_title: null,
  release_year: 2026,
  duration_minutes: 100,
  poster_url: null,
  genres: ["Drama"],
  starts_at_local: "2026-09-25T20:15:00",
  starts_at: "2026-09-25T17:15:00.000Z",
  timezone: "Europe/Kyiv",
  audio_language: null,
  subtitle_languages: [],
  audio_type: null,
  version_type: null,
  format: "2D",
  auditorium: null,
  screening_tags: [],
  ticket_url: null,
  source_url: "https://planetakino.ua/movie/movie-1",
  raw_language: null,
  raw_version: null,
};

const parsed = (records = 1, rows: CinemaNormalizedScreening[] = []): CinemaParseResult => ({
  rows,
  records_parsed: records,
  records_valid: records,
  records_rejected: 0,
  min_schedule_date: records ? "2026-09-25" : null,
  max_schedule_date: records ? "2026-09-25" : null,
  expected_until: "2026-09-25",
  fetch_complete: true,
  parser_complete: true,
  scope_complete: records > 0,
  fatal_error: false,
  zero_result: records === 0,
  errors: [],
  metrics: {},
});

const adapter = (key: string, records = 1, rows: CinemaNormalizedScreening[] = []): CinemaAdapter => ({
  key,
  async fetchSnapshot(source) {
    return {
      adapter_key: key,
      fetched_at: "2026-09-25T12:00:00.000Z",
      root_url: source.source_url,
      pages: [{ url: source.source_url, status: 200, body: "<html>fixture</html>" }],
      failures: [],
    };
  },
  parseSnapshot() {
    return parsed(records, rows);
  },
});

describe("AFISHI005D read-only execution bridge", () => {
  it("builds a disabled non-persistent adapter source config", () => {
    const config = toCinemaSourceConfig(executable);
    expect(config.enabled).toBe(false);
    expect(config.timezone).toBe("Europe/Kyiv");
    expect(config.config).toEqual({ execution_mode: "read_only_adapter_bridge", persistence: "none" });
  });

  it("executes fetch then parse and returns provenance without persistence", async () => {
    const result = await executeReadOnlySource(executable, adapter("planeta_kino_ua", 1, [screening]));
    expect(result.execution_status).toBe("success");
    expect(result.persistence).toBe("none");
    expect(result.fetched_at).toBe("2026-09-25T12:00:00.000Z");
    expect(result.requested_url).toBe(executable.official_source_url);
    expect(result.final_url).toBe(executable.official_source_url);
    expect(result.records_valid).toBe(1);
    expect(result.records_parsed).toBe(1);
    expect(result.screenings).toEqual([screening]);
  });

  it("does not call an adapter for fail-closed sources", async () => {
    let called = false;
    const forbidden: CinemaAdapter = {
      ...adapter("cinestar_cz"),
      async fetchSnapshot(source) {
        called = true;
        return adapter("cinestar_cz").fetchSnapshot(source);
      },
    };
    const result = await executeReadOnlySource({
      source_id: "cs_prague_cinestar",
      adapter_key: "cinestar_cz",
      status: "fail_closed",
      official_source_url: null,
      reason: "prague_venue_ambiguous",
    }, forbidden);
    expect(called).toBe(false);
    expect(result.execution_status).toBe("fail_closed");
    expect(result.persistence).toBe("none");
    expect(result.screenings).toEqual([]);
  });

  it("isolates a source failure and continues the remaining plan", async () => {
    const failing: CinemaAdapter = {
      ...adapter("planeta_kino_ua"),
      async fetchSnapshot() { throw new Error("network_blocked"); },
    };
    const plan = await executeReadOnlyPlan([
      executable,
      {
        source_id: "cs_prague_premiere",
        adapter_key: "premiere_cz",
        status: "executable",
        official_source_url: "https://www.premierecinemas.cz/",
      },
    ], {
      planeta_kino_ua: failing,
      premiere_cz: adapter("premiere_cz"),
    });
    expect(plan.production_writes).toBe(false);
    expect(plan.credentials_required).toBe(false);
    expect(plan.schedule_activation).toBe(false);
    expect(plan.persistence).toBe("none");
    expect(plan.results.map((result) => result.execution_status)).toEqual(["failed", "success"]);
    expect(plan.results[0].errors).toEqual(["network_blocked"]);
  });
});

describe("AFISHI005E Daily Sheets projection", () => {
  it("projects normalized rows into the exact three Daily sheets without writes", () => {
    const plan: ReadOnlyExecutionPlan = {
      mode: "read_only_adapter_bridge",
      production_writes: false,
      credentials_required: false,
      schedule_activation: false,
      persistence: "none",
      results: [
        {
          source_id: "uk_kyiv_planetakino",
          adapter_key: "planeta_kino_ua",
          execution_status: "success",
          persistence: "none",
          fetched_at: "2026-09-25T12:00:00.000Z",
          requested_url: executable.official_source_url,
          final_url: executable.official_source_url,
          pages_fetched: 1,
          fetch_failures: 0,
          records_parsed: 1,
          records_valid: 1,
          parser_complete: true,
          scope_complete: true,
          screenings: [screening],
          errors: [],
        },
        {
          source_id: "cs_prague_cinestar",
          adapter_key: "cinestar_cz",
          execution_status: "fail_closed",
          persistence: "none",
          fetched_at: null,
          requested_url: null,
          final_url: null,
          pages_fetched: 0,
          fetch_failures: 0,
          records_parsed: 0,
          records_valid: 0,
          parser_complete: null,
          scope_complete: null,
          screenings: [],
          errors: ["prague_venue_ambiguous"],
        },
      ],
    };

    const payload = buildDailySheetPayload(plan, {
      run_id: "run-1",
      run_date: "2026-09-25",
      started_at: "2026-09-25T12:00:00.000Z",
      finished_at: "2026-09-25T12:01:00.000Z",
    });

    expect(payload.production_writes).toBe(false);
    expect(payload.allowed_sheets).toEqual(["Daily_Movies", "Daily_Screenings", "Daily_Runs"]);
    expect(payload.Daily_Movies).toEqual([{
      run_date: "2026-09-25",
      source_id: "uk_kyiv_planetakino",
      movie_key: "uk_kyiv_planetakino:movie-1",
      title: "Film",
      original_title: null,
      release_year: 2026,
      duration_minutes: 100,
      genres: "Drama",
      poster_url: null,
      source_url: "https://planetakino.ua/movie/movie-1",
      last_seen_run_id: "run-1",
    }]);
    expect(payload.Daily_Screenings).toEqual([{
      source_id: "uk_kyiv_planetakino",
      external_screening_id: "screening-1",
      movie_key: "uk_kyiv_planetakino:movie-1",
      cinema_name: null,
      city: "Kyiv",
      venue_timezone: "Europe/Kyiv",
      starts_at: "2026-09-25T17:15:00.000Z",
      local_date: "2026-09-25",
      local_time: "20:15",
      format: "2D",
      ticket_url: null,
      source_url: "https://planetakino.ua/movie/movie-1",
      run_id: "run-1",
      row_hash: "h12345678",
    }]);
    expect(payload.Daily_Runs.find((row) => row.source_id === "uk_kyiv_planetakino")?.rows_fetched).toBeNull();
    expect(payload.Daily_Runs.find((row) => row.source_id === "cs_prague_cinestar")).toMatchObject({
      screenings_count: 0,
      movies_count: 0,
      status: "fail_closed",
      is_complete: true,
      error: "prague_venue_ambiguous",
    });
  });
});
