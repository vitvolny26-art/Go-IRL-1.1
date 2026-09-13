import { describe, expect, it } from "vitest";
import { cinemaxCzAdapter } from "./cinemax-cz.js";
import type { CinemaRawSnapshotPayload, CinemaSourceConfig } from "../cinema-ingestion-types.js";

const source: CinemaSourceConfig = {
  id: "00000000-0000-0000-0000-000000000021",
  venue_id: "00000000-0000-0000-0000-000000000022",
  source_id: "cinemax_cz",
  adapter_key: "cinemax_cz",
  source_url: "https://cz.kinoafisha.info/olomouc/cinema/8329748/schedule/",
  fetch_method: "html",
  parser_version: "1.0.0",
  timezone: "Europe/Prague",
  enabled: false,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 2,
  min_records: 2,
  config: { source_kind: "secondary_schedule_fallback", secondary_fallback_approved: true },
};

const fixture = `
<html><body>
<h2>Cinemax Olympia Olomouc schedule in Olomouc on 13 September 2026</h2>
<a href="https://www.kinoafisha.info/en/movies/8374515/"><img alt="poster" /></a>
<a href="https://www.kinoafisha.info/en/movies/8374515/">Spider-Man: Brand New Day</a>
<span>Action, Adventure 2026, USA</span><div>2D</div><div>12:50 17:30</div>
<a href="https://www.kinoafisha.info/en/movies/8374999/">Dokonalý den</a>
<span>Comedy 2026, Czechia</span><div>2D, CZ</div><div>18:00</div>
<h2>Cinemax Olympia Olomouc schedule in Olomouc on 14 September 2026</h2>
<a href="https://www.kinoafisha.info/en/movies/8374999/">Dokonalý den</a>
<span>Comedy 2026, Czechia</span><div>2D</div><div>18:00</div>
</body></html>`;

const payload: CinemaRawSnapshotPayload = {
  adapter_key: "cinemax_cz",
  fetched_at: "2026-09-13T08:00:00.000Z",
  root_url: source.source_url,
  pages: [{ url: source.source_url, status: 200, body: fixture }],
  failures: [],
};

describe("cinemaxCzAdapter", () => {
  it("parses multi-day server-rendered fallback and stays deterministic", () => {
    const first = cinemaxCzAdapter.parseSnapshot(source, payload);
    const second = cinemaxCzAdapter.parseSnapshot(source, payload);
    expect(first.scope_complete).toBe(true);
    expect(first.records_valid).toBe(4);
    expect(first.records_rejected).toBe(0);
    expect(first.rows[0]).toMatchObject({
      external_movie_id: "8374515",
      title: "Spider-Man: Brand New Day",
      starts_at_local: "2026-09-13T12:50:00",
      starts_at: "2026-09-13T10:50:00.000Z",
      format: "2D",
    });
    expect(first.rows.find((row) => row.raw_language === "CZ")).toMatchObject({ audio_language: "cs", version_type: "cz" });
    expect(second.rows.map((row) => row.screening_fingerprint)).toEqual(first.rows.map((row) => row.screening_fingerprint));
  });

  it("fails closed when schedule coverage is partial", () => {
    const partialSource = { ...source, expected_horizon_days: 3 };
    const result = cinemaxCzAdapter.parseSnapshot(partialSource, payload);
    expect(result.records_valid).toBe(4);
    expect(result.scope_complete).toBe(false);
  });

  it("refuses an unapproved secondary fallback before fetching", async () => {
    const blockedSource = { ...source, config: { ...source.config, secondary_fallback_approved: false } };
    const result = await cinemaxCzAdapter.fetchSnapshot(blockedSource);
    expect(result.pages).toHaveLength(0);
    expect(result.failures[0]?.error).toBe("secondary_fallback_not_approved");
  });

  it("fails closed when fetch fails", () => {
    const result = cinemaxCzAdapter.parseSnapshot(source, { ...payload, failures: [{ url: source.source_url, error: "http_503" }] });
    expect(result.fetch_complete).toBe(false);
    expect(result.scope_complete).toBe(false);
  });
});
