import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20261004151500_kino000h_screening_sync_lifecycle.sql", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../api/_shared/cinema-ingestion-worker.ts", import.meta.url),
  "utf8",
);

describe("Kino000H screening sync/lifecycle contract", () => {
  it("allows reconciliation only for a complete non-zero parse", () => {
    expect(migration).toContain("v_parse.status <> 'success'");
    expect(migration).toContain("not v_parse.fetch_complete");
    expect(migration).toContain("not v_parse.parser_complete");
    expect(migration).toContain("not v_parse.scope_complete");
    expect(migration).toContain("v_parse.fatal_error");
    expect(migration).toContain("v_parse.zero_result");
    expect(migration).toContain("v_expected_count = 0");
  });

  it("bounds removals to exact source, venue, and authoritative date window", () => {
    expect(migration).toContain("s.cinema_id = v_source.venue_id");
    expect(migration).toContain("s.source_id = v_source.source_id");
    expect(migration).toContain("between v_parse.min_schedule_date and v_parse.max_schedule_date");
    expect(migration).toContain("s.last_seen_sync_run_id is distinct from v_sync_run_id");
  });

  it("only removes still-schedulable rows and does not touch completed history", () => {
    expect(migration).toContain("s.status in ('scheduled', 'sold_out', 'active')");
  });

  it("reactivates removed screenings through the canonical upsert and audits it", () => {
    expect(migration).toContain("v_existing_status = 'removed'");
    expect(migration).toContain("v_reactivated_count := v_reactivated_count + 1");
    expect(migration).toContain("records_reactivated = v_reactivated_count");
  });

  it("makes repeat apply of the same parse run idempotent", () => {
    expect(migration).toContain("cinema_sync_runs_parse_run_uidx");
    expect(migration).toContain("where parse_run_id = p_parse_run_id");
    expect(migration).toContain("return v_existing_sync_run_id");
  });

  it("uses external screening id first and fingerprint only as fallback", () => {
    const external = migration.indexOf("if v_row.external_screening_id is not null then");
    const fingerprint = migration.indexOf("elsif v_row.screening_fingerprint is not null then");
    expect(external).toBeGreaterThan(-1);
    expect(fingerprint).toBeGreaterThan(external);
  });

  it("persists deterministic lifecycle audit metrics and exposes them to the worker result", () => {
    for (const field of [
      "records_inserted",
      "records_updated",
      "records_reactivated",
      "records_removed",
      "schedule_known_from",
      "schedule_known_until",
    ]) {
      expect(migration).toContain(field);
      expect(worker).toContain(field);
    }
    expect(worker).toContain("screening_lifecycle");
  });
});
