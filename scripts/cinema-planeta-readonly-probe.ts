import "../api/_shared/cinema-adapters/register.js";
import { getCinemaAdapter } from "../api/_shared/cinema-adapters/premiere-cz.js";
import type { CinemaSourceConfig } from "../api/_shared/cinema-ingestion-types.js";

const source: CinemaSourceConfig = {
  id: "readonly-live-probe",
  venue_id: "readonly-live-probe",
  source_id: "uk_kyiv_planetakino",
  adapter_key: "planeta_kino_ua",
  source_url: "https://planetakino.ua/",
  fetch_method: "html",
  parser_version: "1.0.0",
  timezone: "Europe/Kyiv",
  enabled: false,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 1,
  min_records: 1,
  config: {},
};

const compact = (value: unknown) =>
  value instanceof Error ? value.message.replace(/[^A-Za-z0-9:_./ -]/g, "").slice(0, 200) : "unknown_error";

async function main() {
  const adapter = getCinemaAdapter(source.adapter_key);
  const snapshot = await adapter.fetchSnapshot(source);
  const parsed = adapter.parseSnapshot(source, snapshot);

  const summary = {
    source_id: source.source_id,
    adapter_key: source.adapter_key,
    source_url: source.source_url,
    fetched_at: snapshot.fetched_at,
    fetched_pages: snapshot.pages.length,
    fetch_failures: snapshot.failures.length,
    records_parsed: parsed.records_parsed,
    records_valid: parsed.records_valid,
    records_rejected: parsed.records_rejected,
    min_schedule_date: parsed.min_schedule_date,
    max_schedule_date: parsed.max_schedule_date,
    fetch_complete: parsed.fetch_complete,
    parser_complete: parsed.parser_complete,
    scope_complete: parsed.scope_complete,
    zero_result: parsed.zero_result,
    errors: parsed.errors,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!parsed.fetch_complete || !parsed.parser_complete || parsed.zero_result) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: compact(error) }));
  process.exitCode = 1;
});
