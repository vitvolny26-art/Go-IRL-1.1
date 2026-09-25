import type { CinemaAdapter, CinemaNormalizedScreening, CinemaParseResult, CinemaSourceConfig } from "../api/_shared/cinema-ingestion-types.js";
import { planetaKinoUaAdapter } from "../api/_shared/cinema-adapters/planeta-kino-ua.js";
import { premiereCzAdapter } from "../api/_shared/cinema-adapters/premiere-cz.js";

export type ReadOnlySourceConfig = {
  source_id: string;
  adapter_key: string;
  status: "executable" | "fail_closed";
  official_source_url: string | null;
  reason?: string;
};

export type ReadOnlyExecutionResult = {
  source_id: string;
  adapter_key: string;
  execution_status: "success" | "empty" | "failed" | "fail_closed";
  persistence: "none";
  fetched_at: string | null;
  requested_url: string | null;
  final_url: string | null;
  pages_fetched: number;
  fetch_failures: number;
  records_parsed: number;
  records_valid: number;
  parser_complete: boolean | null;
  scope_complete: boolean | null;
  screenings: CinemaNormalizedScreening[];
  errors: string[];
};

export type ReadOnlyExecutionPlan = {
  mode: "read_only_adapter_bridge";
  production_writes: false;
  credentials_required: false;
  schedule_activation: false;
  persistence: "none";
  results: ReadOnlyExecutionResult[];
};

export type DailySnapshotMeta = {
  run_id: string;
  run_date: string;
  started_at: string;
  finished_at: string;
};

export type DailyMovieRow = {
  run_date: string;
  source_id: string;
  movie_key: string;
  title: string;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  genres: string;
  poster_url: string | null;
  source_url: string;
  last_seen_run_id: string;
};

export type DailyScreeningRow = {
  source_id: string;
  external_screening_id: string | null;
  movie_key: string;
  cinema_name: string | null;
  city: string;
  venue_timezone: string;
  starts_at: string;
  local_date: string;
  local_time: string;
  format: string | null;
  ticket_url: string | null;
  source_url: string;
  run_id: string;
  row_hash: string;
};

export type DailyRunRow = {
  run_id: string;
  source_id: string;
  started_at: string;
  finished_at: string;
  rows_fetched: null;
  rows_parsed: number;
  movies_count: number;
  screenings_count: number;
  is_complete: boolean;
  status: ReadOnlyExecutionResult["execution_status"];
  error: string | null;
};

const adapters: Record<string, CinemaAdapter> = {
  planeta_kino_ua: planetaKinoUaAdapter,
  premiere_cz: premiereCzAdapter,
};

const sourceDefaults: Record<string, Pick<CinemaSourceConfig, "timezone" | "expected_horizon_days" | "min_records"> & { city: string; cinema_name: string | null }> = {
  uk_kyiv_planetakino: {
    timezone: "Europe/Kyiv",
    expected_horizon_days: 1,
    min_records: 1,
    city: "Kyiv",
    cinema_name: null,
  },
  cs_prague_premiere: {
    timezone: "Europe/Prague",
    expected_horizon_days: 1,
    min_records: 1,
    city: "Prague",
    cinema_name: null,
  },
};

export const toCinemaSourceConfig = (source: ReadOnlySourceConfig): CinemaSourceConfig => {
  if (source.status !== "executable" || !source.official_source_url) throw new Error(`source_not_executable:${source.source_id}`);
  const defaults = sourceDefaults[source.source_id];
  if (!defaults) throw new Error(`source_defaults_missing:${source.source_id}`);
  return {
    id: `afishi005d:${source.source_id}`,
    venue_id: `afishi005d:${source.source_id}`,
    source_id: source.source_id,
    adapter_key: source.adapter_key,
    source_url: source.official_source_url,
    fetch_method: "html",
    parser_version: "afishi005d-read-only",
    timezone: defaults.timezone,
    enabled: false,
    fetch_interval_minutes: 1440,
    expected_horizon_days: defaults.expected_horizon_days,
    min_records: defaults.min_records,
    config: { execution_mode: "read_only_adapter_bridge", persistence: "none" },
  };
};

const resultFromParse = (
  source: ReadOnlySourceConfig,
  parsed: CinemaParseResult,
  payload: Awaited<ReturnType<CinemaAdapter["fetchSnapshot"]>>,
): ReadOnlyExecutionResult => ({
  source_id: source.source_id,
  adapter_key: source.adapter_key,
  execution_status: parsed.records_valid > 0 ? "success" : parsed.zero_result ? "empty" : "failed",
  persistence: "none",
  fetched_at: payload.fetched_at,
  requested_url: source.official_source_url,
  final_url: payload.pages[0]?.url ?? payload.root_url,
  pages_fetched: payload.pages.length,
  fetch_failures: payload.failures.length,
  records_parsed: parsed.records_parsed,
  records_valid: parsed.records_valid,
  parser_complete: parsed.parser_complete,
  scope_complete: parsed.scope_complete,
  screenings: parsed.rows,
  errors: parsed.errors,
});

export const executeReadOnlySource = async (
  source: ReadOnlySourceConfig,
  adapterOverride?: CinemaAdapter,
): Promise<ReadOnlyExecutionResult> => {
  if (source.status === "fail_closed") {
    return {
      source_id: source.source_id,
      adapter_key: source.adapter_key,
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
      errors: [source.reason || "fail_closed"],
    };
  }

  const adapter = adapterOverride ?? adapters[source.adapter_key];
  if (!adapter) throw new Error(`adapter_not_allowed:${source.adapter_key}`);
  const config = toCinemaSourceConfig(source);

  try {
    const payload = await adapter.fetchSnapshot(config);
    const parsed = adapter.parseSnapshot(config, payload);
    return resultFromParse(source, parsed, payload);
  } catch (error) {
    return {
      source_id: source.source_id,
      adapter_key: source.adapter_key,
      execution_status: "failed",
      persistence: "none",
      fetched_at: null,
      requested_url: source.official_source_url,
      final_url: null,
      pages_fetched: 0,
      fetch_failures: 1,
      records_parsed: 0,
      records_valid: 0,
      parser_complete: false,
      scope_complete: false,
      screenings: [],
      errors: [error instanceof Error ? error.message : "execution_failed"],
    };
  }
};

export const executeReadOnlyPlan = async (
  sources: ReadOnlySourceConfig[],
  adapterOverrides: Partial<Record<string, CinemaAdapter>> = {},
): Promise<ReadOnlyExecutionPlan> => {
  const results: ReadOnlyExecutionResult[] = [];
  for (const source of sources) {
    results.push(await executeReadOnlySource(source, adapterOverrides[source.adapter_key]));
  }
  return {
    mode: "read_only_adapter_bridge",
    production_writes: false,
    credentials_required: false,
    schedule_activation: false,
    persistence: "none",
    results,
  };
};

const localParts = (startsAtLocal: string) => {
  const [local_date = "", time = ""] = startsAtLocal.split("T", 2);
  return { local_date, local_time: time.slice(0, 5) };
};

export const buildDailySheetPayload = (plan: ReadOnlyExecutionPlan, meta: DailySnapshotMeta) => {
  const movies = new Map<string, DailyMovieRow>();
  const screenings: DailyScreeningRow[] = [];
  const runs: DailyRunRow[] = [];

  for (const result of plan.results) {
    const defaults = sourceDefaults[result.source_id];
    if (!defaults && result.screenings.length) throw new Error(`source_defaults_missing:${result.source_id}`);

    for (const row of result.screenings) {
      const movie_key = `${result.source_id}:${row.external_movie_id}`;
      if (!movies.has(movie_key)) {
        movies.set(movie_key, {
          run_date: meta.run_date,
          source_id: result.source_id,
          movie_key,
          title: row.title,
          original_title: row.original_title,
          release_year: row.release_year,
          duration_minutes: row.duration_minutes,
          genres: (row.genres || []).join("|"),
          poster_url: row.poster_url ?? null,
          source_url: row.source_url,
          last_seen_run_id: meta.run_id,
        });
      }
      const { local_date, local_time } = localParts(row.starts_at_local);
      screenings.push({
        source_id: result.source_id,
        external_screening_id: row.external_screening_id,
        movie_key,
        cinema_name: defaults?.cinema_name ?? null,
        city: defaults?.city ?? "",
        venue_timezone: row.timezone,
        starts_at: row.starts_at,
        local_date,
        local_time,
        format: row.format,
        ticket_url: row.ticket_url,
        source_url: row.source_url,
        run_id: meta.run_id,
        row_hash: row.screening_fingerprint,
      });
    }

    const movies_count = new Set(result.screenings.map(row => `${result.source_id}:${row.external_movie_id}`)).size;
    runs.push({
      run_id: meta.run_id,
      source_id: result.source_id,
      started_at: meta.started_at,
      finished_at: meta.finished_at,
      rows_fetched: null,
      rows_parsed: result.records_parsed,
      movies_count,
      screenings_count: result.screenings.length,
      is_complete: result.execution_status !== "failed",
      status: result.execution_status,
      error: result.errors.length ? result.errors.join("; ") : null,
    });
  }

  return {
    mode: "google_sheets_snapshot_payload" as const,
    production_writes: false as const,
    allowed_sheets: ["Daily_Movies", "Daily_Screenings", "Daily_Runs"] as const,
    Daily_Movies: [...movies.values()].sort((a, b) => a.movie_key.localeCompare(b.movie_key)),
    Daily_Screenings: screenings.sort((a, b) => a.row_hash.localeCompare(b.row_hash)),
    Daily_Runs: runs.sort((a, b) => a.source_id.localeCompare(b.source_id)),
  };
};
