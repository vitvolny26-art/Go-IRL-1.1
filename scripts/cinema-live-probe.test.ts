import { describe, expect, it } from "vitest";
import { premiereCzAdapter } from "../api/_shared/cinema-adapters/premiere-cz.js";
import { cinestarCzAdapter } from "../api/_shared/cinema-adapters/cinestar-cz.js";
import { planetaKinoUaAdapter } from "../api/_shared/cinema-adapters/planeta-kino-ua.js";
import type { CinemaRawSnapshotPayload, CinemaSourceConfig } from "../api/_shared/cinema-ingestion-types.js";

const fetchHtml = async (url: string) => {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "GO-IRL-Cinema-Live-Probe/1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body.length).toBeGreaterThan(1000);
  return { url: response.url || url, status: response.status, body };
};

const source = (values: Partial<CinemaSourceConfig> & Pick<CinemaSourceConfig, "source_id" | "adapter_key" | "source_url">): CinemaSourceConfig => ({
  id: "00000000-0000-0000-0000-000000000101",
  venue_id: "00000000-0000-0000-0000-000000000102",
  fetch_method: "html",
  parser_version: "1.0.0",
  timezone: "Europe/Prague",
  enabled: false,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 1,
  min_records: 1,
  config: {},
  ...values,
});

const payload = async (adapterKey: string, rootUrl: string, movieUrl: string): Promise<CinemaRawSnapshotPayload> => {
  const [index, movie] = await Promise.all([fetchHtml(rootUrl), fetchHtml(movieUrl)]);
  return { adapter_key: adapterKey, fetched_at: new Date().toISOString(), root_url: rootUrl, pages: [index, movie], failures: [] };
};

describe("cinema adapters live read-only probe", () => {
  it("parses current Premiere Olomouc server HTML", async () => {
    const config = source({ source_id: "premiere_cinemas_cz", adapter_key: "premiere_cz", source_url: "https://olomouc.premierecinemas.cz/" });
    const snapshot = await payload("premiere_cz", "https://olomouc.premierecinemas.cz/filmy/", "https://olomouc.premierecinemas.cz/filmy/dokonaly-den/");
    const result = premiereCzAdapter.parseSnapshot(config, snapshot);
    expect(result.parser_complete).toBe(true);
    expect(result.zero_result).toBe(false);
    expect(result.records_valid).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.title === "Dokonalý den")).toBe(true);
  }, 30_000);

  it("parses current CineStar Olomouc server HTML", async () => {
    const config = source({ source_id: "cinestar_cz", adapter_key: "cinestar_cz", source_url: "https://cinestar.cz/cz/olomouc/" });
    const snapshot = await payload("cinestar_cz", "https://cinestar.cz/cz/olomouc/filmy", "https://cinestar.cz/cz/olomouc/filmy/movie/10688-magicka-posedlost-2");
    const result = cinestarCzAdapter.parseSnapshot(config, snapshot);
    expect(result.parser_complete).toBe(true);
    expect(result.zero_result).toBe(false);
    expect(result.records_valid).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.title === "Magická posedlost 2")).toBe(true);
    expect(result.rows.every((row) => row.timezone === "Europe/Prague")).toBe(true);
    expect(result.rows.every((row) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/.test(row.starts_at_local))).toBe(true);
    expect(result.rows.every((row) => /^sha256:[0-9a-f]{64}$/.test(row.screening_fingerprint))).toBe(true);
  }, 30_000);

  it("fetches and parses current Planeta Kino Kyiv HTML without production writes", async () => {
    const config = source({
      source_id: "uk_kyiv_planetakino",
      adapter_key: "planeta_kino_ua",
      source_url: "https://planetakino.ua/",
      timezone: "Europe/Kyiv",
      enabled: false,
    });
    const snapshot = await planetaKinoUaAdapter.fetchSnapshot(config);
    expect(snapshot.failures).toEqual([]);
    expect(snapshot.pages.length).toBeGreaterThan(0);
    expect(snapshot.pages.every((page) => page.status === 200)).toBe(true);
    const result = planetaKinoUaAdapter.parseSnapshot(config, snapshot);
    expect(result.fetch_complete).toBe(true);
    if (result.parser_complete) {
      expect(result.zero_result).toBe(false);
      expect(result.records_valid).toBeGreaterThan(0);
      expect(result.rows.every((row) => row.timezone === "Europe/Kyiv")).toBe(true);
      expect(result.rows.every((row) => /^sha256:[0-9a-f]{64}$/.test(row.screening_fingerprint))).toBe(true);
    } else {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.every((error) =>
        /schedule_cards_missing|challenge_response|projection_date_missing|screening_parse_failed/.test(error)
      )).toBe(true);
    }
  }, 30_000);
});
