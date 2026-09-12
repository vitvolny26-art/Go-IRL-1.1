import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { premiereCzAdapter } from "../api/_shared/cinema-adapters/premiere-cz.js";
import type { CinemaSourceConfig } from "../api/_shared/cinema-ingestion-types.js";

const source: CinemaSourceConfig = {
  id: "30b39b03-65b9-4538-b10c-f5dc6b8d79de",
  venue_id: "f99d3b45-6095-4928-a395-af86495341e2",
  source_id: "premiere_cinemas_cz",
  adapter_key: "premiere_cz",
  source_url: "https://olomouc.premierecinemas.cz/",
  fetch_method: "html",
  parser_version: "1.0.0",
  timezone: "Europe/Prague",
  enabled: true,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 5,
  min_records: 1,
  config: {},
};

const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

describe("one-shot live Premiere snapshot capture", () => {
  it("captures immutable raw payload and parse result without database writes", async () => {
    const snapshot = await premiereCzAdapter.fetchSnapshot(source);
    const parse = premiereCzAdapter.parseSnapshot(source, snapshot);
    const rawJson = JSON.stringify(snapshot);
    const contentHash = hash(rawJson);

    expect(snapshot.pages.length).toBeGreaterThan(1);
    expect(snapshot.failures).toEqual([]);
    expect(parse.records_valid).toBeGreaterThan(0);

    const directory = "public/__cinema_capture";
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/premiere-snapshot.json`, JSON.stringify({
      content_hash: contentHash,
      source_config_id: source.id,
      venue_id: source.venue_id,
      source_id: source.source_id,
      parser_version: source.parser_version,
      payload: snapshot,
    }));
    await writeFile(`${directory}/premiere-parse.json`, JSON.stringify({
      content_hash: contentHash,
      source_config_id: source.id,
      parser_version: source.parser_version,
      parse,
    }));

    console.warn("cinema_live_capture", {
      contentHash,
      pages: snapshot.pages.length,
      failures: snapshot.failures.length,
      recordsValid: parse.records_valid,
      scopeComplete: parse.scope_complete,
      minDate: parse.min_schedule_date,
      maxDate: parse.max_schedule_date,
      expectedUntil: parse.expected_until,
    });
  }, 120_000);
});
