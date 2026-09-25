import type { CinemaAdapter, CinemaParseResult, CinemaSourceConfig } from "../api/_shared/cinema-ingestion-types.js";
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
  records_valid: number;
  parser_complete: boolean | null;
  scope_complete: boolean | null;
  errors: string[];
};

const adapters: Record<string, CinemaAdapter> = {
  planeta_kino_ua: planetaKinoUaAdapter,
  premiere_cz: premiereCzAdapter,
};

const sourceDefaults: Record<string, Pick<CinemaSourceConfig, "timezone" | "expected_horizon_days" | "min_records">> = {
  uk_kyiv_planetakino: { timezone: "Europe/Kyiv", expected_horizon_days: 1, min_records: 1 },
  cs_prague_premiere: { timezone: "Europe/Prague", expected_horizon_days: 1, min_records: 1 },
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
  records_valid: parsed.records_valid,
  parser_complete: parsed.parser_complete,
  scope_complete: parsed.scope_complete,
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
      records_valid: 0,
      parser_complete: null,
      scope_complete: null,
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
      records_valid: 0,
      parser_complete: false,
      scope_complete: false,
      errors: [error instanceof Error ? error.message : "execution_failed"],
    };
  }
};

export const executeReadOnlyPlan = async (
  sources: ReadOnlySourceConfig[],
  adapterOverrides: Partial<Record<string, CinemaAdapter>> = {},
) => {
  const results: ReadOnlyExecutionResult[] = [];
  for (const source of sources) {
    results.push(await executeReadOnlySource(source, adapterOverrides[source.adapter_key]));
  }
  return {
    mode: "read_only_adapter_bridge" as const,
    production_writes: false as const,
    credentials_required: false as const,
    schedule_activation: false as const,
    persistence: "none" as const,
    results,
  };
};
