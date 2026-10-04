import { describe, expect, it } from "vitest";
import {
  evaluateCinemaWeeklyLocalizationReadiness,
  type CinemaLocalizationReadinessRow,
} from "./cinema-weekly-localization-readiness.js";

const candidates = [
  { candidate_id: "candidate-1", movie_id: "movie-1", rank: 1 },
  { candidate_id: "candidate-2", movie_id: "movie-2", rank: 2 },
];

const matched = (candidateId: string, movieId: string): CinemaLocalizationReadinessRow[] =>
  (["ru", "uk", "cs", "en", "pl", "sk"] as const).map((locale) => ({
    candidate_id: candidateId,
    movie_id: movieId,
    rank: candidateId === "candidate-1" ? 1 : 2,
    locale,
    status: "matched",
  }));

describe("Kino000N weekly localization readiness", () => {
  it("marks a candidate ready only when all six required locales are matched", () => {
    const summary = evaluateCinemaWeeklyLocalizationReadiness({
      weeklySelectionId: "selection-1",
      candidates: [candidates[0]],
      results: matched("candidate-1", "movie-1"),
    });

    expect(summary).toMatchObject({
      publication_authorized: false,
      required_locale_count: 6,
      candidate_count: 1,
      ready_candidate_count: 1,
      all_ready: true,
    });
    expect(summary.candidates[0]).toMatchObject({
      ready: true,
      matched_locale_count: 6,
      blockers: [],
    });
  });

  it("keeps missing and non-matched outcomes as explicit blockers", () => {
    const results = matched("candidate-1", "movie-1").filter((row) => row.locale !== "sk");
    const uk = results.find((row) => row.locale === "uk");
    if (!uk) throw new Error("fixture_missing");
    uk.status = "ambiguous";

    const summary = evaluateCinemaWeeklyLocalizationReadiness({
      weeklySelectionId: "selection-1",
      candidates: [candidates[0]],
      results,
    });

    expect(summary.all_ready).toBe(false);
    expect(summary.candidates[0]).toMatchObject({
      ready: false,
      matched_locale_count: 4,
      blockers: ["uk", "sk"],
    });
    expect(summary.candidates[0].locales).toMatchObject({
      uk: "ambiguous",
      sk: "missing",
    });
  });

  it("preserves deterministic rank order and weekly aggregate readiness", () => {
    const summary = evaluateCinemaWeeklyLocalizationReadiness({
      weeklySelectionId: "selection-1",
      candidates: [candidates[1], candidates[0]],
      results: [
        ...matched("candidate-2", "movie-2"),
        ...matched("candidate-1", "movie-1"),
      ],
    });

    expect(summary.candidates.map((candidate) => candidate.rank)).toEqual([1, 2]);
    expect(summary.ready_candidate_count).toBe(2);
    expect(summary.all_ready).toBe(true);
  });

  it("fails closed on duplicate locale evidence", () => {
    const rows = matched("candidate-1", "movie-1");
    expect(() => evaluateCinemaWeeklyLocalizationReadiness({
      weeklySelectionId: "selection-1",
      candidates: [candidates[0]],
      results: [...rows, rows[0]],
    })).toThrow(/result_duplicate/);
  });

  it("fails closed when localization evidence belongs to another movie", () => {
    expect(() => evaluateCinemaWeeklyLocalizationReadiness({
      weeklySelectionId: "selection-1",
      candidates: [candidates[0]],
      results: [{
        candidate_id: "candidate-1",
        movie_id: "movie-other",
        rank: 1,
        locale: "en",
        status: "matched",
      }],
    })).toThrow(/identity_mismatch/);
  });
});
