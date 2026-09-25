import { describe, expect, it } from "vitest";
import type { CinemaAdapter, CinemaParseResult } from "../api/_shared/cinema-ingestion-types.js";
import { executeReadOnlyPlan, executeReadOnlySource, toCinemaSourceConfig } from "./kino001d-read-only-execution.js";

const executable = {
  source_id: "uk_kyiv_planetakino",
  adapter_key: "planeta_kino_ua",
  status: "executable" as const,
  official_source_url: "https://planetakino.ua/schedule/?cinema=cinema-1-uk",
};

const parsed = (records = 1): CinemaParseResult => ({
  rows: [],
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

const adapter = (key: string, records = 1): CinemaAdapter => ({
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
  parseSnapshot(_source, _payload) {
    return parsed(records);
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
    const result = await executeReadOnlySource(executable, adapter("planeta_kino_ua"));
    expect(result.execution_status).toBe("success");
    expect(result.persistence).toBe("none");
    expect(result.fetched_at).toBe("2026-09-25T12:00:00.000Z");
    expect(result.requested_url).toBe(executable.official_source_url);
    expect(result.final_url).toBe(executable.official_source_url);
    expect(result.records_valid).toBe(1);
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
