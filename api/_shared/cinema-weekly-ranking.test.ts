import { describe, expect, it } from "vitest";
import { rankCinemaWeeklyCandidates } from "./cinema-weekly-ranking.js";
import type { CinemaWeeklyWindowCandidate } from "./cinema-weekly-window.js";

const candidate = (overrides: Partial<CinemaWeeklyWindowCandidate> = {}): CinemaWeeklyWindowCandidate => ({
  id: "00000000-0000-0000-0000-000000000001",
  movie_id: "10000000-0000-0000-0000-000000000001",
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

describe("Kino000L deterministic Top 10 ranking", () => {
  it("orders by score descending and assigns ranks 1..N", () => {
    const ranked = rankCinemaWeeklyCandidates([
      candidate({ id: "00000000-0000-0000-0000-000000000003", movie_id: "30000000-0000-0000-0000-000000000003", score: 70 }),
      candidate({ id: "00000000-0000-0000-0000-000000000001", movie_id: "10000000-0000-0000-0000-000000000001", score: 90 }),
      candidate({ id: "00000000-0000-0000-0000-000000000002", movie_id: "20000000-0000-0000-0000-000000000002", score: 80 }),
    ]);
    expect(ranked.map((row) => [row.rank, row.score])).toEqual([[1, 90], [2, 80], [3, 70]]);
  });

  it("uses stable window and candidate-id tie breakers independent of input order", () => {
    const rows = [
      candidate({ id: "00000000-0000-0000-0000-000000000003", movie_id: "30000000-0000-0000-0000-000000000003", score: 80, showing_from: "2026-10-06" }),
      candidate({ id: "00000000-0000-0000-0000-000000000002", movie_id: "20000000-0000-0000-0000-000000000002", score: 80, showing_until: "2026-10-10" }),
      candidate({ id: "00000000-0000-0000-0000-000000000001", movie_id: "10000000-0000-0000-0000-000000000001", score: 80 }),
    ];
    expect(rankCinemaWeeklyCandidates(rows).map((row) => row.id))
      .toEqual(rankCinemaWeeklyCandidates([...rows].reverse()).map((row) => row.id));
    expect(rankCinemaWeeklyCandidates(rows).map((row) => row.id)).toEqual([
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
      "00000000-0000-0000-0000-000000000003",
    ]);
  });

  it("keeps only the best deterministic daily candidate for each movie", () => {
    const ranked = rankCinemaWeeklyCandidates([
      candidate({ id: "00000000-0000-0000-0000-000000000002", score: 60 }),
      candidate({ id: "00000000-0000-0000-0000-000000000001", score: 70 }),
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("caps the ranking at Top 10", () => {
    const rows = Array.from({ length: 12 }, (_, index) => candidate({
      id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
      movie_id: `10000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
      score: 100 - index,
    }));
    expect(rankCinemaWeeklyCandidates(rows)).toHaveLength(10);
    expect(rankCinemaWeeklyCandidates(rows).at(-1)?.rank).toBe(10);
  });

  it("rejects invalid limits or candidate scores", () => {
    expect(() => rankCinemaWeeklyCandidates([candidate()], 11)).toThrow(/top_limit_invalid/);
    expect(() => rankCinemaWeeklyCandidates([candidate({ score: -1 })])).toThrow(/candidate_invalid/);
  });
});
