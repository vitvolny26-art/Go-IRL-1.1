import { describe, expect, it } from "vitest";
import {
  cinemaScreeningActionUrl,
  groupCinemaPosterMovies,
  selectCinemaPosterRows,
  type CityPosterCinemaRow,
} from "./cinemaModel";

const row = (overrides: Partial<CityPosterCinemaRow> = {}): CityPosterCinemaRow => ({
  screening_id: "screen-1",
  movie_id: "movie-1",
  cinema_id: "cinema-1",
  cinema_name: "Premiere Cinemas",
  cinema_address: "Olomouc",
  venue_timezone: "Europe/Prague",
  movie_title: "Příklad filmu",
  original_title: "Example Movie",
  release_year: 2026,
  duration_minutes: 110,
  genres: ["Drama"],
  age_rating: "12+",
  imdb_rating: 7.2,
  poster_url: null,
  description: null,
  starts_at: "2026-09-14T10:00:00Z",
  ends_at: null,
  local_date: "2026-09-14",
  local_time: "12:00",
  audio_language: "cs",
  subtitle_languages: [],
  version_type: null,
  format: "2D",
  auditorium: null,
  screening_tags: [],
  ticket_url: null,
  source_url: "https://example.test/schedule",
  ...overrides,
});

describe("City Posters cinema model", () => {
  it("filters the public cinema catalog by City Posters time state", () => {
    const now = new Date("2026-09-14T08:00:00Z");
    const rows = [
      row(),
      row({ screening_id: "screen-2", starts_at: "2026-09-15T10:00:00Z", local_date: "2026-09-15", local_time: "12:00" }),
    ];
    expect(selectCinemaPosterRows(rows, { timeFilter: "today", now }).map((item) => item.screening_id)).toEqual(["screen-1"]);
    expect(selectCinemaPosterRows(rows, { timeFilter: "tomorrow", now }).map((item) => item.screening_id)).toEqual(["screen-2"]);
  });

  it("keeps a currently running screening in the Now filter when ends_at is known", () => {
    const current = row({
      starts_at: "2026-09-14T07:00:00Z",
      ends_at: "2026-09-14T09:00:00Z",
      local_time: "09:00",
    });
    expect(selectCinemaPosterRows([current], {
      timeFilter: "now",
      now: new Date("2026-09-14T08:00:00Z"),
    })).toHaveLength(1);
  });

  it("searches Unicode movie, venue and genre text without turning unsupported letters into match-all", () => {
    const rows = [
      row({ movie_title: "Семейный фильм", cinema_name: "Kino Šantovka" }),
      row({ screening_id: "screen-2", movie_id: "movie-2", movie_title: "Polski Łowca", cinema_name: "CineStar" }),
    ];
    const now = new Date("2026-09-14T08:00:00Z");
    expect(selectCinemaPosterRows(rows, { timeFilter: "today", query: "семейный", now }).map((item) => item.movie_id)).toEqual(["movie-1"]);
    expect(selectCinemaPosterRows(rows, { timeFilter: "today", query: "šantovka", now }).map((item) => item.movie_id)).toEqual(["movie-1"]);
    expect(selectCinemaPosterRows(rows, { timeFilter: "today", query: "łowca", now }).map((item) => item.movie_id)).toEqual(["movie-2"]);
    expect(selectCinemaPosterRows(rows, { timeFilter: "today", query: "ЖЖЖ", now })).toHaveLength(0);
  });

  it("groups one movie across cinemas into one City Posters card", () => {
    const groups = groupCinemaPosterMovies([
      row(),
      row({ screening_id: "screen-2", cinema_id: "cinema-2", cinema_name: "CineStar", local_time: "18:00", starts_at: "2026-09-14T16:00:00Z" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].movieId).toBe("movie-1");
    expect(groups[0].rows).toHaveLength(2);
  });

  it("allows only http(s) screening actions and prefers ticket URLs", () => {
    expect(cinemaScreeningActionUrl(row({ ticket_url: "https://tickets.example/1" }))).toBe("https://tickets.example/1");
    expect(cinemaScreeningActionUrl(row({ ticket_url: "javascript:alert(1)", source_url: "https://example.test/schedule" }))).toBe("https://example.test/schedule");
    expect(cinemaScreeningActionUrl(row({ ticket_url: "javascript:alert(1)", source_url: "data:text/html,test" }))).toBeNull();
  });
});
