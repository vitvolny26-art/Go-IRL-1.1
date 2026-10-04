import { describe, expect, it } from "vitest";
import {
  buildCinemaMovieEnrichmentUpdate,
  selectTmdbMovieCandidate,
  selectTmdbMovieDetails,
  type CinemaMovieEnrichmentRow,
  type TmdbMovieDetails,
} from "./cinema-movie-enrichment.js";

const movie = (overrides: Partial<CinemaMovieEnrichmentRow> = {}): CinemaMovieEnrichmentRow => ({
  id: "movie-1",
  title: "Dune",
  original_title: null,
  release_year: 2021,
  duration_minutes: 155,
  genres: [],
  countries: [],
  original_language: null,
  age_rating: null,
  imdb_id: null,
  rating_status: null,
  poster_url: null,
  poster_source: null,
  synopsis_source: null,
  synopsis_generated: null,
  director: null,
  lead_actors: [],
  external_ids: {},
  ...overrides,
});

const details = (overrides: Partial<TmdbMovieDetails> = {}): TmdbMovieDetails => ({
  id: 438631,
  title: "Dune",
  original_title: "Dune",
  release_date: "2021-09-15",
  runtime: 155,
  genres: [{ name: "Science Fiction" }],
  production_countries: [{ iso_3166_1: "US" }],
  original_language: "en",
  imdb_id: "tt1160419",
  poster_path: "/poster.jpg",
  overview: "A test overview.",
  credits: {
    crew: [{ job: "Director", name: "Denis Villeneuve" }],
    cast: [
      { name: "Actor One", order: 0 },
      { name: "Actor Two", order: 1 },
    ],
  },
  ...overrides,
});

describe("Kino000I canonical movie enrichment contract", () => {
  it("uses exact title identity and known release year for search candidates", () => {
    expect(selectTmdbMovieCandidate(movie(), [
      { id: 1, title: "Dune", release_date: "1984-12-14" },
      { id: 2, title: "Dune", release_date: "2021-09-15" },
      { id: 3, title: "Dune Part Two", release_date: "2021-09-15" },
    ])).toEqual({ status: "matched", candidate: { id: 2, title: "Dune", release_date: "2021-09-15" } });
  });

  it("fails closed on conflicting known duration", () => {
    expect(selectTmdbMovieDetails(movie(), [details({ runtime: 171 })])).toEqual({
      status: "mismatch",
      candidateIds: [438631],
    });
  });

  it("fails closed on conflicting known year", () => {
    expect(selectTmdbMovieDetails(movie(), [details({ release_date: "1984-12-14" })])).toEqual({
      status: "mismatch",
      candidateIds: [438631],
    });
  });

  it("uses duration to disambiguate multiple exact-title candidates", () => {
    const decision = selectTmdbMovieDetails(movie(), [
      details({ id: 1, runtime: 155 }),
      details({ id: 2, runtime: 190 }),
    ]);
    expect(decision.status).toBe("matched");
    if (decision.status === "matched") expect(decision.details.id).toBe(1);
  });

  it("keeps ambiguity when multiple candidates remain compatible", () => {
    expect(selectTmdbMovieDetails(movie(), [
      details({ id: 2, runtime: 154 }),
      details({ id: 1, runtime: 155 }),
    ])).toEqual({ status: "ambiguous", candidateIds: [1, 2] });
  });

  it("preserves stronger existing canonical metadata and provenance", () => {
    const update = buildCinemaMovieEnrichmentUpdate(movie({
      original_title: "Canonical Original",
      duration_minutes: 154,
      genres: ["Drama"],
      countries: ["CZ"],
      original_language: "cs",
      age_rating: "15",
      imdb_id: "tt-existing",
      rating_status: "verified",
      poster_url: "https://official.example/poster.jpg",
      poster_source: "official_distributor",
      synopsis_generated: "Curated synopsis",
      synopsis_source: "official_distributor",
      director: "Existing Director",
      lead_actors: ["Existing Actor"],
      external_ids: { source: "abc" },
    }), details());

    expect(update).not.toHaveProperty("original_title");
    expect(update).not.toHaveProperty("duration_minutes");
    expect(update).not.toHaveProperty("genres");
    expect(update).not.toHaveProperty("countries");
    expect(update).not.toHaveProperty("original_language");
    expect(update).not.toHaveProperty("age_rating");
    expect(update).not.toHaveProperty("imdb_id");
    expect(update).not.toHaveProperty("poster_url");
    expect(update).not.toHaveProperty("synopsis_generated");
    expect(update).not.toHaveProperty("director");
    expect(update).not.toHaveProperty("lead_actors");
    expect(update.external_ids).toEqual({ source: "abc", tmdb: 438631 });
  });

  it("writes deterministic provider fields and provenance when canonical fields are empty", () => {
    const update = buildCinemaMovieEnrichmentUpdate(movie({ release_year: null, duration_minutes: null }), details());
    expect(update).toMatchObject({
      original_title: "Dune",
      release_year: 2021,
      duration_minutes: 155,
      genres: ["Science Fiction"],
      countries: ["US"],
      original_language: "en",
      imdb_id: "tt1160419",
      rating_status: "pending",
      poster_url: "https://image.tmdb.org/t/p/original/poster.jpg",
      poster_source: "tmdb",
      synopsis_generated: "A test overview.",
      synopsis_source: "tmdb",
      director: "Denis Villeneuve",
      lead_actors: ["Actor One", "Actor Two"],
      external_ids: { tmdb: 438631 },
    });
  });

  it("is idempotent once identical TMDB-owned data is already persisted", () => {
    const populated = movie({
      original_title: "Dune",
      genres: ["Science Fiction"],
      countries: ["US"],
      original_language: "en",
      imdb_id: "tt1160419",
      rating_status: "pending",
      poster_url: "https://image.tmdb.org/t/p/original/poster.jpg",
      poster_source: "tmdb",
      synopsis_generated: "A test overview.",
      synopsis_source: "tmdb",
      director: "Denis Villeneuve",
      lead_actors: ["Actor One", "Actor Two"],
      external_ids: { tmdb: 438631 },
    });
    expect(buildCinemaMovieEnrichmentUpdate(populated, details())).toEqual({});
  });
});
