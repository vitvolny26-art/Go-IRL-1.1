import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = readFileSync(
  new URL("../api/_shared/cinema-weekly-imdb-ranking.ts", import.meta.url),
  "utf8",
);

describe("Kino000O IMDb Top-25 → verified Top-10 contract", () => {
  it("reuses governed TMDB enrichment and preserves Kino000L ordering", () => {
    expect(runtime).toContain("enrichCinemaMovieFromTmdb");
    expect(runtime).toContain("right.score - left.score");
    expect(runtime).toContain("left.showing_from.localeCompare");
    expect(runtime).toContain("right.showing_until.localeCompare");
    expect(runtime).toContain("output.length === 25");
  });

  it("requires verified IMDb IDs for the final ten and never authorizes publication", () => {
    expect(runtime).toContain("verifiedTop10.length === 10");
    expect(runtime).toContain("publication_authorized: false");
    expect(runtime).toContain("existing_imdb");
    expect(runtime).toContain("tmdb_identity");
    expect(runtime).not.toContain("publication_authorized: true");
    expect(runtime).not.toContain("city_posters_events");
    expect(runtime).not.toContain("telegram");
  });
});
