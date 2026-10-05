import { describe, expect, it } from "vitest";
import { rankCinemaWeeklyTop25 } from "./cinema-weekly-imdb-ranking.js";

describe("Kino000O IMDb Top-25 ranking", () => {
  it("preserves deterministic ordering and keeps one candidate per movie", () => {
    const rows = [
      { id: "b", movie_id: "m1", score: 10, title: "M1 later", showing_from: "2026-10-06", showing_until: "2026-10-11" },
      { id: "a", movie_id: "m1", score: 10, title: "M1 first", showing_from: "2026-10-05", showing_until: "2026-10-11" },
      { id: "c", movie_id: "m2", score: 9, title: "M2", showing_from: "2026-10-05", showing_until: "2026-10-11" },
    ];
    expect(rankCinemaWeeklyTop25(rows).map(({ source_candidate_id, movie_id, rank }) => ({ source_candidate_id, movie_id, rank }))).toEqual([
      { source_candidate_id: "a", movie_id: "m1", rank: 1 },
      { source_candidate_id: "c", movie_id: "m2", rank: 2 },
    ]);
  });

  it("caps enrichment inventory at 25 unique movies", () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      id: `c${String(index).padStart(2, "0")}`,
      movie_id: `m${index}`,
      score: 100 - index,
      title: `Movie ${index}`,
      showing_from: "2026-10-05",
      showing_until: "2026-10-11",
    }));
    const ranked = rankCinemaWeeklyTop25(rows);
    expect(ranked).toHaveLength(25);
    expect(ranked.at(-1)?.rank).toBe(25);
  });
});
