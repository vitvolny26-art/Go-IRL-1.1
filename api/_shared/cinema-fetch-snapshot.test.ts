import { describe, expect, it } from "vitest";
import type { CinemaRawSnapshotPayload, CinemaSourceConfig } from "./cinema-ingestion-types.js";
import {
  buildCinemaFetchSnapshotEvidence,
  canonicalCinemaSnapshotJson,
  cinemaFetchDownstreamPlan,
  classifyCinemaFetchStatus,
  hashCinemaRawSnapshotPayload,
  validateCinemaRawSnapshotPayload,
} from "./cinema-fetch-snapshot.js";

const source: CinemaSourceConfig = {
  id: "source-config",
  venue_id: "venue",
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

const payload = (overrides: Partial<CinemaRawSnapshotPayload> = {}): CinemaRawSnapshotPayload => ({
  adapter_key: "premiere_cz",
  fetched_at: "2026-10-04T12:00:00.000Z",
  root_url: "https://olomouc.premierecinemas.cz/",
  pages: [
    {
      url: "https://olomouc.premierecinemas.cz/program",
      status: 200,
      body: "<html>schedule</html>",
    },
  ],
  failures: [],
  ...overrides,
});

describe("Kino000D fetch/raw snapshot contract", () => {
  it("builds complete immutable fetch evidence before downstream processing", () => {
    const evidence = buildCinemaFetchSnapshotEvidence({
      source,
      payload: payload(),
      workerJobId: "job-1",
    });

    expect(evidence.fetchStatus).toBe("fetched");
    expect(evidence.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(evidence.row).toEqual(expect.objectContaining({
      source_config_id: "source-config",
      venue_id: "venue",
      source_id: "premiere_cinemas_cz",
      source_url: "https://olomouc.premierecinemas.cz/",
      fetched_at: "2026-10-04T12:00:00.000Z",
      fetch_status: "fetched",
      raw_format: "json",
      raw_payload: payload(),
      parser_version: "1.0.0",
      content_hash: evidence.contentHash,
    }));
  });

  it("hashes the same semantic payload deterministically regardless of object key order", () => {
    const left = payload();
    const right = {
      failures: [],
      pages: [
        {
          body: "<html>schedule</html>",
          status: 200,
          url: "https://olomouc.premierecinemas.cz/program",
        },
      ],
      root_url: "https://olomouc.premierecinemas.cz/",
      fetched_at: "2026-10-04T12:00:00.000Z",
      adapter_key: "premiere_cz",
    } as CinemaRawSnapshotPayload;

    expect(canonicalCinemaSnapshotJson(left)).toBe(canonicalCinemaSnapshotJson(right));
    expect(hashCinemaRawSnapshotPayload(left)).toBe(hashCinemaRawSnapshotPayload(right));
  });

  it("classifies fetched, partial, and failed payloads exactly", () => {
    expect(classifyCinemaFetchStatus(payload())).toBe("fetched");
    expect(classifyCinemaFetchStatus(payload({
      failures: [{ url: "https://olomouc.premierecinemas.cz/extra", error: "timeout" }],
    }))).toBe("partial");
    expect(classifyCinemaFetchStatus(payload({
      pages: [],
      failures: [{ url: "https://olomouc.premierecinemas.cz/program", error: "timeout" }],
    }))).toBe("failed");
  });

  it("always archives created snapshot evidence and never parses a failed fetch", () => {
    expect(cinemaFetchDownstreamPlan("fetched")).toEqual({ archiveDrive: true, parse: true });
    expect(cinemaFetchDownstreamPlan("partial")).toEqual({ archiveDrive: true, parse: true });
    expect(cinemaFetchDownstreamPlan("failed")).toEqual({ archiveDrive: true, parse: false });
  });

  it("rejects empty or malformed adapter payloads before snapshot insertion", () => {
    expect(() => validateCinemaRawSnapshotPayload(source, payload({ pages: [], failures: [] })))
      .toThrow("cinema_fetch_empty_payload");
    expect(() => validateCinemaRawSnapshotPayload(source, payload({ adapter_key: "other_adapter" })))
      .toThrow("cinema_fetch_adapter_mismatch");
    expect(() => validateCinemaRawSnapshotPayload(source, payload({ root_url: "http://example.invalid" })))
      .toThrow("cinema_fetch_root_url_invalid");
    expect(() => validateCinemaRawSnapshotPayload(source, payload({ fetched_at: "not-a-date" })))
      .toThrow("cinema_fetch_timestamp_invalid");
  });
});
