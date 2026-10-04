import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const aggregation = readFileSync(
  new URL("../api/_shared/cinema-daily-candidates.ts", import.meta.url),
  "utf8",
);
const persistence = readFileSync(
  new URL("../api/_shared/cinema-daily-candidate-persistence.ts", import.meta.url),
  "utf8",
);
const runtime = readFileSync(
  new URL("../api/_shared/cinema-daily-candidate-runtime.ts", import.meta.url),
  "utf8",
);

describe("Kino000J daily candidate aggregation contract", () => {
  it("aggregates only scheduled active canonical screenings from runtime", () => {
    expect(runtime).toContain('.eq("status", "scheduled")');
    expect(runtime).toContain('.eq("cinema_venues.active", true)');
    expect(runtime).toContain("screening_id: row.id");
    expect(runtime).toContain("buildDailyMovieCityCandidates(screenings)");
  });

  it("uses movie+city identity, exact screening dedupe, and deterministic windows", () => {
    expect(aggregation).toContain('const key = `${row.movie_id}:${row.city_id}`');
    expect(aggregation).toContain("seenScreenings.has(row.screening_id)");
    expect(aggregation).toContain("showing_from: dates[0]");
    expect(aggregation).toContain("showing_until: dates.at(-1) || dates[0]");
    expect(aggregation).toContain("compareText(left.local_date, right.local_date)");
  });

  it("fails closed on conflicting canonical metadata instead of order-dependent scoring", () => {
    expect(aggregation).toContain("cinema_candidate_title_conflict");
    expect(aggregation).toContain("cinema_candidate_city_name_conflict");
    expect(aggregation).toContain("cinema_candidate_release_year_conflict");
    expect(aggregation).toContain("cinema_candidate_imdb_rating_conflict");
    expect(aggregation).toContain("cinema_candidate_imdb_votes_conflict");
  });

  it("keeps candidate persistence publication-safe and exact-window based", () => {
    expect(persistence).toContain("publication_authorized: false");
    expect(persistence).toContain("owner_decision_required: true");
    expect(persistence).toContain("showing_from: candidate.showing_from");
    expect(persistence).toContain("showing_until: candidate.showing_until");
    expect(persistence).toContain("cinema_candidate_duplicate_movie_city");
  });

  it("does not introduce weekly ranking or publication semantics", () => {
    expect(aggregation).not.toContain("weekly");
    expect(aggregation).not.toContain("top10");
    expect(aggregation).not.toContain("publish");
  });
});
