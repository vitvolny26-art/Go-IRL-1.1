import { describe, expect, it } from "vitest";
import { planetaKinoUaAdapter } from "./planeta-kino-ua.js";
import type { CinemaRawSnapshotPayload, CinemaSourceConfig } from "../cinema-ingestion-types.js";

const source: CinemaSourceConfig = {
  id: "00000000-0000-0000-0000-000000000021",
  venue_id: "00000000-0000-0000-0000-000000000022",
  source_id: "planeta_kino_ua",
  adapter_key: "planeta_kino_ua",
  source_url: "https://planetakino.ua/movies/",
  fetch_method: "html",
  parser_version: "1.0.0",
  timezone: "Europe/Kyiv",
  enabled: false,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 1,
  min_records: 1,
  config: {},
};

const page = (dateLabel: string, time: string, sessionId = "session-1001") => `
<html><body>
  <div>Сьогодні, ${dateLabel}</div>
  <div data-component-name="MovieWithSessionsCard">
    <a href="/movie/test-film">Тестовий фільм</a>
    <div id="${sessionId}-session-slide-item">
      <div class="time"><span>${time}</span></div>
      <div class="text-neutral-100">2D</div>
    </div>
  </div>
  <div data-component-name="SessionItem"></div>
</body></html>`;

const payload = (
  fetchedAt: string,
  dateLabel: string,
  time: string,
  sessionId = "session-1001",
): CinemaRawSnapshotPayload => ({
  adapter_key: "planeta_kino_ua",
  fetched_at: fetchedAt,
  root_url: source.source_url,
  pages: [{ url: source.source_url, status: 200, body: page(dateLabel, time, sessionId) }],
  failures: [],
});

describe("planetaKinoUaAdapter", () => {
  it("replays an immutable payload deterministically without inventing metadata", () => {
    const snapshot = payload("2026-09-12T08:00:00.000Z", "12 вересня", "18:00");
    const before = JSON.stringify(snapshot);
    const first = planetaKinoUaAdapter.parseSnapshot(source, snapshot);
    const second = planetaKinoUaAdapter.parseSnapshot(source, snapshot);

    expect(JSON.stringify(snapshot)).toBe(before);
    expect(second).toEqual(first);
    expect(first.scope_complete).toBe(true);
    expect(first.records_valid).toBe(1);
    expect(first.rows[0]).toMatchObject({
      external_screening_id: "session-1001",
      external_movie_id: "test-film",
      title: "Тестовий фільм",
      starts_at_local: "2026-09-12T18:00:00",
      starts_at: "2026-09-12T15:00:00.000Z",
      timezone: "Europe/Kyiv",
      release_year: null,
      duration_minutes: null,
      audio_language: null,
      subtitle_languages: [],
    });
    expect(first.rows[0]).not.toHaveProperty("imdb_rating");
  });

  it("normalizes year rollover from December capture into January", () => {
    const result = planetaKinoUaAdapter.parseSnapshot(
      source,
      payload("2026-12-31T20:00:00.000Z", "5 січня", "20:00", "session-jan"),
    );
    expect(result.rows[0]).toMatchObject({
      starts_at_local: "2027-01-05T20:00:00",
      starts_at: "2027-01-05T18:00:00.000Z",
    });
  });

  it("uses Europe/Kyiv winter and summer offsets deterministically", () => {
    const winter = planetaKinoUaAdapter.parseSnapshot(
      source,
      payload("2026-01-15T08:00:00.000Z", "15 січня", "20:00", "session-winter"),
    );
    const summer = planetaKinoUaAdapter.parseSnapshot(
      source,
      payload("2026-07-15T08:00:00.000Z", "15 липня", "20:00", "session-summer"),
    );
    expect(winter.rows[0].starts_at).toBe("2026-01-15T18:00:00.000Z");
    expect(summer.rows[0].starts_at).toBe("2026-07-15T17:00:00.000Z");
  });

  it("fails closed for malformed or challenge payloads", () => {
    const malformed = planetaKinoUaAdapter.parseSnapshot(source, {
      ...payload("2026-09-12T08:00:00.000Z", "12 вересня", "18:00"),
      pages: [{ url: source.source_url, status: 200, body: "<html>captcha</html>" }],
    });
    expect(malformed.records_valid).toBe(0);
    expect(malformed.parser_complete).toBe(false);
    expect(malformed.scope_complete).toBe(false);
    expect(malformed.errors).toContain("schedule_cards_missing");
  });
});
