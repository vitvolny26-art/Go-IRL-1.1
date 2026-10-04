import { describe, expect, it } from "vitest";
import {
  CINEMA_WEEKLY_TIMEZONE,
  candidateIntersectsWeeklyWindow,
  computeNextCinemaWeeklyWindow,
  filterCinemaWeeklyWindowCandidates,
  type CinemaWeeklyWindowCandidate,
} from "./cinema-weekly-window.js";

const candidate = (overrides: Partial<CinemaWeeklyWindowCandidate> = {}): CinemaWeeklyWindowCandidate => ({
  id: "candidate-1",
  movie_id: "movie-1",
  city_id: "olomouc",
  city_name: "Olomouc",
  title: "Movie",
  showing_from: "2026-10-05",
  showing_until: "2026-10-11",
  score: 50,
  priority: "store",
  lifecycle_status: "active",
  ...overrides,
});

describe("Kino000K weekly window", () => {
  it("computes the coming Monday-Sunday week in Europe/Prague from Sunday", () => {
    expect(computeNextCinemaWeeklyWindow(new Date("2026-10-04T04:00:00.000Z"))).toEqual({
      timezone: CINEMA_WEEKLY_TIMEZONE,
      week_start: "2026-10-05",
      week_end: "2026-10-11",
    });
  });

  it("always selects the following calendar week when run on Monday", () => {
    expect(computeNextCinemaWeeklyWindow(new Date("2026-10-05T04:00:00.000Z"))).toMatchObject({
      week_start: "2026-10-12",
      week_end: "2026-10-18",
    });
  });

  it("is calendar-safe across the Prague DST transition", () => {
    expect(computeNextCinemaWeeklyWindow(new Date("2026-03-29T04:00:00.000Z"))).toMatchObject({
      week_start: "2026-03-30",
      week_end: "2026-04-05",
    });
  });

  it("includes active candidates that overlap either edge of the weekly window", () => {
    const window = computeNextCinemaWeeklyWindow(new Date("2026-10-04T04:00:00.000Z"));
    expect(candidateIntersectsWeeklyWindow(candidate({ showing_from: "2026-10-01", showing_until: "2026-10-05" }), window)).toBe(true);
    expect(candidateIntersectsWeeklyWindow(candidate({ showing_from: "2026-10-11", showing_until: "2026-10-20" }), window)).toBe(true);
  });

  it("excludes candidates fully outside the weekly window or not active", () => {
    const window = computeNextCinemaWeeklyWindow(new Date("2026-10-04T04:00:00.000Z"));
    expect(candidateIntersectsWeeklyWindow(candidate({ showing_from: "2026-10-01", showing_until: "2026-10-04" }), window)).toBe(false);
    expect(candidateIntersectsWeeklyWindow(candidate({ showing_from: "2026-10-12", showing_until: "2026-10-20" }), window)).toBe(false);
    expect(candidateIntersectsWeeklyWindow(candidate({ lifecycle_status: "superseded" }), window)).toBe(false);
  });

  it("filters by city and returns deterministic non-ranking order", () => {
    const window = computeNextCinemaWeeklyWindow(new Date("2026-10-04T04:00:00.000Z"));
    const result = filterCinemaWeeklyWindowCandidates([
      candidate({ id: "b", title: "Zulu", showing_from: "2026-10-07", score: 99 }),
      candidate({ id: "a", title: "Alpha", showing_from: "2026-10-05", score: 1 }),
      candidate({ id: "x", city_id: "prague", title: "Prague", score: 100 }),
    ], window, "olomouc");

    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("fails closed on invalid candidate windows", () => {
    const window = computeNextCinemaWeeklyWindow(new Date("2026-10-04T04:00:00.000Z"));
    expect(() => candidateIntersectsWeeklyWindow(candidate({
      showing_from: "2026-10-10",
      showing_until: "2026-10-09",
    }), window)).toThrow(/cinema_weekly_candidate_window_invalid/);
  });
});
