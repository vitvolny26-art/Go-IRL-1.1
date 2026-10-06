import { describe, expect, it } from "vitest";
import {
  CINEMA_CAPITAL_LOCALIZATION_TARGETS,
  buildCinemaCapitalLocalizationSearchRow,
  selectCinemaCapitalLocalizationCandidate,
  type CinemaLocalizationCanonicalMovie,
  type CinemaLocalizationSearchCandidate,
} from "./cinema-capital-localization-search.js";

const movie: CinemaLocalizationCanonicalMovie = {
  id: "movie-1",
  title: "Dune",
  original_title: "Dune",
  release_year: 2021,
  duration_minutes: 155,
  imdb_id: "tt1160419",
  external_ids: { tmdb: 438631 },
};

const candidate = (overrides: Partial<CinemaLocalizationSearchCandidate> = {}): CinemaLocalizationSearchCandidate => ({
  provider_candidate_id: "source-1",
  title: "Dune",
  original_title: "Dune",
  release_year: 2021,
  duration_minutes: 155,
  external_ids: {},
  localized_title: "Duna",
  synopsis: "Localized synopsis",
  source_url: "https://cinema.example/movie/dune",
  source_name: "Cinema",
  source_kind: "official_cinema",
  ...overrides,
});

describe("Kino000M capital localization search", () => {
  it("defines the six exact locale/capital targets", () => {
    expect(CINEMA_CAPITAL_LOCALIZATION_TARGETS.map(({ locale, capital }) => [locale, capital])).toEqual([
      ["ru", "Moscow"],
      ["uk", "Kyiv"],
      ["cs", "Prague"],
      ["en", "London"],
      ["pl", "Warsaw"],
      ["sk", "Bratislava"],
    ]);
  });

  it("prefers an exact external identity over title matching", () => {
    const result = selectCinemaCapitalLocalizationCandidate(movie, [
      candidate({ provider_candidate_id: "title-only" }),
      candidate({
        provider_candidate_id: "exact-id",
        title: "Completely Localized",
        original_title: null,
        external_ids: { imdb: "tt1160419" },
      }),
    ]);
    expect(result).toMatchObject({
      status: "matched",
      confidence: 1,
      match_basis: "external_id",
      candidate: { provider_candidate_id: "exact-id" },
    });
  });

  it("matches title + year + compatible duration deterministically", () => {
    const result = selectCinemaCapitalLocalizationCandidate(movie, [candidate()]);
    expect(result).toMatchObject({
      status: "matched",
      confidence: 0.9,
      match_basis: "title_year_duration",
    });
  });

  it("fails closed on ambiguous compatible candidates", () => {
    const result = selectCinemaCapitalLocalizationCandidate(movie, [
      candidate({ provider_candidate_id: "b" }),
      candidate({ provider_candidate_id: "a" }),
    ]);
    expect(result).toEqual({ status: "ambiguous", candidate_ids: ["a", "b"] });
  });

  it("deduplicates equivalent UK candidates for the same canonical movie identity", () => {
    const result = selectCinemaCapitalLocalizationCandidate(movie, [
      candidate({ provider_candidate_id: "picturehouse-card", external_ids: { imdb: "tt1160419" }, source_url: "https://cinema.example/movie/dune?card=1" }),
      candidate({ provider_candidate_id: "picturehouse-detail", external_ids: { tmdb: 438631 }, source_url: "https://cinema.example/movie/dune" }),
    ]);
    expect(result).toMatchObject({ status: "matched", confidence: 1, match_basis: "external_id" });
  });

  it("keeps conflicting localization payloads fail-closed even for the same movie identity", () => {
    const result = selectCinemaCapitalLocalizationCandidate(movie, [
      candidate({ provider_candidate_id: "a", external_ids: { imdb: "tt1160419" } }),
      candidate({ provider_candidate_id: "b", external_ids: { tmdb: 438631 }, synopsis: "Conflicting synopsis" }),
    ]);
    expect(result).toEqual({ status: "ambiguous", candidate_ids: ["a", "b"] });
  });

  it("distinguishes mismatch from not-found", () => {
    expect(selectCinemaCapitalLocalizationCandidate(movie, [
      candidate({ release_year: 1984 }),
    ])).toEqual({ status: "mismatch", candidate_ids: ["source-1"] });

    expect(selectCinemaCapitalLocalizationCandidate(movie, [
      candidate({ title: "Arrival", original_title: "Arrival" }),
    ])).toEqual({ status: "not_found", candidate_ids: [] });
  });

  it("never disguises empty or non-HTTPS provenance as a matched localization", () => {
    const target = CINEMA_CAPITAL_LOCALIZATION_TARGETS[2];
    expect(() => selectCinemaCapitalLocalizationCandidate(movie, [
      candidate({ source_url: "http://cinema.example/movie/dune" }),
    ])).toThrow(/candidate_invalid/);

    const matched = selectCinemaCapitalLocalizationCandidate(movie, [
      candidate({ localized_title: null, synopsis: null }),
    ]);
    expect(matched.status).toBe("matched");
    expect(() => buildCinemaCapitalLocalizationSearchRow({
      weeklySelectionId: "selection-1",
      candidateId: "candidate-1",
      movieId: "movie-1",
      target,
      result: matched,
    })).toThrow(/payload_empty/);
  });

  it("stores unmatched outcomes separately without fabricated localized content", () => {
    const row = buildCinemaCapitalLocalizationSearchRow({
      weeklySelectionId: "selection-1",
      candidateId: "candidate-1",
      movieId: "movie-1",
      target: CINEMA_CAPITAL_LOCALIZATION_TARGETS[0],
      result: { status: "ambiguous", candidate_ids: ["a", "b"] },
    });
    expect(row).toMatchObject({
      locale: "ru",
      capital: "Moscow",
      status: "ambiguous",
      localized_title: null,
      synopsis: null,
      confidence: null,
      metadata: { candidate_ids: ["a", "b"] },
    });
  });
});
