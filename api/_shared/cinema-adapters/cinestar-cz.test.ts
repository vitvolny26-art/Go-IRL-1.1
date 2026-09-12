import { describe, expect, it } from "vitest";
import { cinestarCzAdapter } from "./cinestar-cz.js";
import type { CinemaRawSnapshotPayload, CinemaSourceConfig } from "../cinema-ingestion-types.js";

const source: CinemaSourceConfig = {
  id: "00000000-0000-0000-0000-000000000011",
  venue_id: "00000000-0000-0000-0000-000000000012",
  source_id: "cinestar_cz",
  adapter_key: "cinestar_cz",
  source_url: "https://cinestar.cz/cz/olomouc/",
  fetch_method: "html",
  parser_version: "1.0.0",
  timezone: "Europe/Prague",
  enabled: false,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 1,
  min_records: 1,
  config: {},
};

const moviePage = `
<html><body>
  <h1>Magická posedlost 2 TITULKY</h1>
  <div>130 min.</div>
  <section id="program">
    <div>12. 9. 2026</div>
    <div>PREMIUM</div>
    <div><img alt="Titulky" /></div>
    <div>7.1</div>
    <div>4K</div>
    <button data-performance-id="99001">18:00</button>

    <div>STANDARD</div>
    <div><img alt="Titulky" /></div>
    <div>7.1</div>
    <button data-performance-id="99002">12:40</button>
    <button data-performance-id="99003">15:20</button>
  </section>
</body></html>`;

const payload: CinemaRawSnapshotPayload = {
  adapter_key: "cinestar_cz",
  fetched_at: "2026-09-12T08:00:00.000Z",
  root_url: "https://cinestar.cz/cz/olomouc/filmy",
  pages: [
    {
      url: "https://cinestar.cz/cz/olomouc/filmy",
      status: 200,
      body: "<a href='/cz/olomouc/filmy/movie/10688-magicka-posedlost-2'>Magická posedlost 2</a>",
    },
    {
      url: "https://cinestar.cz/cz/olomouc/filmy/movie/10688-magicka-posedlost-2",
      status: 200,
      body: moviePage,
    },
  ],
  failures: [],
};

describe("cinestarCzAdapter", () => {
  it("keeps adjacent auditorium/format segments isolated", () => {
    const result = cinestarCzAdapter.parseSnapshot(source, payload);
    expect(result.scope_complete).toBe(true);
    expect(result.records_valid).toBe(3);
    expect(result.records_rejected).toBe(0);

    expect(result.rows[0]).toMatchObject({
      external_screening_id: "99002",
      external_movie_id: "10688",
      title: "Magická posedlost 2",
      duration_minutes: 130,
      starts_at_local: "2026-09-12T12:40:00",
      starts_at: "2026-09-12T10:40:00.000Z",
      auditorium: "STANDARD",
      version_type: "subtitled",
      subtitle_languages: ["cs"],
      audio_type: "7.1",
      format: "2D",
    });

    const premium = result.rows.find((row) => row.external_screening_id === "99001");
    expect(premium).toMatchObject({
      starts_at_local: "2026-09-12T18:00:00",
      auditorium: "PREMIUM",
      audio_type: "7.1",
      format: "4K",
    });
    expect(result.rows.find((row) => row.external_screening_id === "99002")?.screening_tags)
      .not.toContain("4K");
  });

  it("quarantines partial fetches instead of making them writable", () => {
    const partial = cinestarCzAdapter.parseSnapshot(source, {
      ...payload,
      failures: [{ url: "https://cinestar.cz/cz/olomouc/filmy/movie/99999-missing", error: "http_503" }],
    });
    expect(partial.records_valid).toBe(3);
    expect(partial.fetch_complete).toBe(false);
    expect(partial.scope_complete).toBe(false);
  });

  it("replays to identical fallback screening fingerprints", () => {
    const first = cinestarCzAdapter.parseSnapshot(source, payload);
    const second = cinestarCzAdapter.parseSnapshot(source, payload);
    expect(second.rows.map((row) => row.screening_fingerprint))
      .toEqual(first.rows.map((row) => row.screening_fingerprint));
  });
});
