import { describe, expect, it } from "vitest";
import { premiereCzAdapter } from "./premiere-cz.js";
import type { CinemaRawSnapshotPayload, CinemaSourceConfig } from "../cinema-ingestion-types.js";

const source: CinemaSourceConfig = {
  id: "00000000-0000-0000-0000-000000000001",
  venue_id: "00000000-0000-0000-0000-000000000002",
  source_id: "premiere_cinemas_cz",
  adapter_key: "premiere_cz",
  source_url: "https://olomouc.premierecinemas.cz/",
  fetch_method: "html",
  parser_version: "1.0.0",
  timezone: "Europe/Prague",
  enabled: true,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 1,
  min_records: 1,
  config: {},
};

const moviePage = `
<html><body>
  <h1>Mimoni a monstra</h1>
  <div>Minions &amp; Monsters</div>
  <p>Animovaný / Komedie</p>
  <p>USA, 2026, 85 min.</p>
  <table>
    <thead><tr><th>Datum</th><th>Přístupnost</th><th>Znění</th><th>Verze</th><th>Časy projekce</th></tr></thead>
    <tbody>
      <tr>
        <td>Sobota 12. 9.</td><td>P</td><td>cz</td><td>D-BOX 3D</td>
        <td>
          <a href="/vstupenky/?screeningId=175771">11:40</a>
          <a href="/vstupenky/?screeningId=175772">13:40</a>
        </td>
      </tr>
    </tbody>
  </table>
</body></html>`;

const payload: CinemaRawSnapshotPayload = {
  adapter_key: "premiere_cz",
  fetched_at: "2026-09-12T08:00:00.000Z",
  root_url: "https://olomouc.premierecinemas.cz/filmy/",
  pages: [
    { url: "https://olomouc.premierecinemas.cz/filmy/", status: 200, body: "<a href='/filmy/mimoni-a-monstra/'>Mimoni</a>" },
    { url: "https://olomouc.premierecinemas.cz/filmy/mimoni-a-monstra/", status: 200, body: moviePage },
  ],
  failures: [],
};

describe("premiereCzAdapter", () => {
  it("normalizes film-page projection rows deterministically", () => {
    const result = premiereCzAdapter.parseSnapshot(source, payload);
    expect(result.scope_complete).toBe(true);
    expect(result.zero_result).toBe(false);
    expect(result.records_valid).toBe(2);
    expect(result.records_rejected).toBe(0);
    expect(result.min_schedule_date).toBe("2026-09-12");
    expect(result.max_schedule_date).toBe("2026-09-12");

    expect(result.rows[0]).toMatchObject({
      external_screening_id: "175771",
      external_movie_id: "mimoni-a-monstra",
      movie_fingerprint: "premiere_cinemas_cz:mimoni-a-monstra:2026",
      title: "Mimoni a monstra",
      release_year: 2026,
      duration_minutes: 85,
      starts_at_local: "2026-09-12T11:40:00",
      starts_at: "2026-09-12T09:40:00.000Z",
      audio_language: "cs",
      format: "3D",
      auditorium: "D-BOX",
    });
    expect(result.rows[0].screening_tags).toEqual(expect.arrayContaining(["D-BOX", "3D"]));
  });

  it("quarantines partial fetches even when rows can be parsed", () => {
    const partial = premiereCzAdapter.parseSnapshot(source, {
      ...payload,
      failures: [{ url: "https://olomouc.premierecinemas.cz/filmy/other/", error: "http_503" }],
    });
    expect(partial.records_valid).toBe(2);
    expect(partial.fetch_complete).toBe(false);
    expect(partial.scope_complete).toBe(false);
  });

  it("produces the same fallback fingerprint when source snapshot is replayed", () => {
    const first = premiereCzAdapter.parseSnapshot(source, payload);
    const second = premiereCzAdapter.parseSnapshot(source, payload);
    expect(second.rows.map((row) => row.screening_fingerprint))
      .toEqual(first.rows.map((row) => row.screening_fingerprint));
  });
});
