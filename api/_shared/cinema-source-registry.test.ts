import { describe, expect, it } from "vitest";
import { inspectCinemaSourceRegistryRow, type CinemaSourceRegistryRow } from "./cinema-source-registry.js";

const base = (overrides: Partial<CinemaSourceRegistryRow> = {}): CinemaSourceRegistryRow => ({
  id: "source-config",
  venue_id: "venue",
  source_id: "premiere_cinemas_cz",
  adapter_key: "premiere_cz",
  source_url: "https://olomouc.premierecinemas.cz/",
  parser_version: "1.0.0",
  timezone: "Europe/Prague",
  enabled: true,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 5,
  min_records: 1,
  last_attempt_at: "2026-10-04T04:00:00.000Z",
  last_success_at: "2026-10-04T09:34:00.000Z",
  consecutive_failures: 0,
  cinema_venues: {
    city_id: "olomouc",
    city_name: "Olomouc",
    active: true,
    monitor_enabled: true,
    trust_score: 70,
    last_fetch_status: "success",
    schedule_known_until: "2026-10-11",
    timezone: "Europe/Prague",
  },
  ...overrides,
});

describe("Kino000B cinema source registry", () => {
  it("marks a complete registered monitored source healthy and monitorable", () => {
    const result = inspectCinemaSourceRegistryRow(
      base(),
      new Set(["premiere_cz"]),
      new Date("2026-10-04T12:00:00.000Z"),
    );
    expect(result).toEqual({
      adapterRegistered: true,
      configurationReady: true,
      currentlyMonitorable: true,
      health: "healthy",
      reasons: [],
    });
  });

  it("fails closed when the configured adapter is not registered in worker code", () => {
    const result = inspectCinemaSourceRegistryRow(
      base({ adapter_key: "metropol_entradio_cz" }),
      new Set(["premiere_cz", "cinestar_cz", "cinemax_cz_ajax"]),
      new Date("2026-10-04T12:00:00.000Z"),
    );
    expect(result.adapterRegistered).toBe(false);
    expect(result.configurationReady).toBe(false);
    expect(result.currentlyMonitorable).toBe(false);
    expect(result.health).toBe("quarantined");
    expect(result.reasons).toContain("adapter_unregistered");
  });

  it("classifies degraded source states without changing activation flags", () => {
    const partial = inspectCinemaSourceRegistryRow(
      base({ consecutive_failures: 1 }),
      new Set(["premiere_cz"]),
      new Date("2026-10-04T12:00:00.000Z"),
    );
    expect(partial.health).toBe("partial");

    const failing = inspectCinemaSourceRegistryRow(
      base({ consecutive_failures: 2 }),
      new Set(["premiere_cz"]),
      new Date("2026-10-04T12:00:00.000Z"),
    );
    expect(failing.health).toBe("failing");

    const disabled = inspectCinemaSourceRegistryRow(
      base({ enabled: false }),
      new Set(["premiere_cz"]),
      new Date("2026-10-04T12:00:00.000Z"),
    );
    expect(disabled.configurationReady).toBe(true);
    expect(disabled.currentlyMonitorable).toBe(false);
    expect(disabled.health).toBe("healthy");
  });

  it("quarantines inconsistent registry configuration", () => {
    const result = inspectCinemaSourceRegistryRow(
      base({
        source_url: "http://example.invalid",
        timezone: "UTC",
        fetch_interval_minutes: 10,
      }),
      new Set(["premiere_cz"]),
      new Date("2026-10-04T12:00:00.000Z"),
    );
    expect(result.health).toBe("quarantined");
    expect(result.reasons).toEqual(expect.arrayContaining([
      "source_url_invalid",
      "fetch_interval_invalid",
      "timezone_mismatch",
    ]));
  });
});
