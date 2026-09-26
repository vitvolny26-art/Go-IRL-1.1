import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCinemaMovieEnrichmentUpdate,
  selectTmdbMovieCandidate,
  type CinemaMovieEnrichmentRow,
} from "./cinema-movie-enrichment.js";
const movie = (values: Partial<CinemaMovieEnrichmentRow> = {}): CinemaMovieEnrichmentRow => ({
  id: "movie-1",
  title: "Odyssea",
  original_title: null,
  release_year: 2026,
  duration_minutes: null,
  genres: [],
  countries: [],
  original_language: null,
  age_rating: null,
  imdb_id: null,
  rating_status: "unknown",
  poster_url: "https://olomouc.premierecinemas.cz/poster.jpg",
  poster_source: "premiere_cinemas_cz",
  synopsis_source: null,
  synopsis_generated: null,
  director: null,
  lead_actors: [],
  external_ids: { premiere: "odyssea" },
  ...values,
});

describe("Kino001C movie metadata enrichment dependency", () => {
  it("matches only one exact title/year candidate and fails closed on ambiguity", () => {
    expect(selectTmdbMovieCandidate(movie(), [
      { id: 10, title: "Odyssea", original_title: "Odyssey", release_date: "2026-03-01" },
      { id: 11, title: "Different", original_title: "Different", release_date: "2026-03-01" },
    ])).toEqual({
      status: "matched",
      candidate: { id: 10, title: "Odyssea", original_title: "Odyssey", release_date: "2026-03-01" },
    });

    expect(selectTmdbMovieCandidate(movie(), [
      { id: 10, title: "Odyssea", release_date: "2026-03-01" },
      { id: 12, original_title: "Odyssea", release_date: "2026-10-02" },
    ])).toEqual({ status: "ambiguous", candidateIds: [10, 12] });

    expect(selectTmdbMovieCandidate(movie(), [
      { id: 13, title: "Odyssea", release_date: "2025-03-01" },
    ])).toEqual({ status: "unavailable" });
  });

  it("fills missing Details metadata without inventing IMDb rating or votes", () => {
    const update = buildCinemaMovieEnrichmentUpdate(movie(), {
      id: 10,
      title: "Odyssea",
      original_title: "Odyssey",
      release_date: "2026-03-01",
      runtime: 172,
      genres: [{ name: "Drama" }, { name: "Adventure" }],
      production_countries: [{ iso_3166_1: "US" }, { iso_3166_1: "CZ" }],
      original_language: "en",
      imdb_id: "tt1234567",
      poster_path: "/poster-original.jpg",
      overview: "A long journey home.",
      release_dates: {
        results: [{
          iso_3166_1: "CZ",
          release_dates: [{ certification: "12", type: 3 }],
        }],
      },
      credits: {
        crew: [{ id: 100, job: "Director", name: "Jane Director" }],
        cast: [
          { id: 201, name: "Third Actor", order: 2 },
          { id: 202, name: "Lead Actor", order: 0 },
          { id: 203, name: "Second Actor", order: 1 },
          { id: 204, name: "Fourth Actor", order: 3 },
          { id: 205, name: "Fifth Actor", order: 4 },
          { id: 206, name: "Sixth Actor", order: 5 },
        ],
      },
    });

    expect(update).toMatchObject({
      original_title: "Odyssey",
      duration_minutes: 172,
      genres: ["Drama", "Adventure"],
      countries: ["US", "CZ"],
      original_language: "en",
      age_rating: "12",
      imdb_id: "tt1234567",
      rating_status: "pending",
      synopsis_source: "tmdb",
      synopsis_generated: "A long journey home.",
      director: "Jane Director",
      lead_actors: ["Lead Actor", "Second Actor", "Third Actor", "Fourth Actor", "Fifth Actor"],
      external_ids: { premiere: "odyssea", tmdb: 10 },
    });
    expect(update).not.toHaveProperty("imdb_rating");
    expect(update).not.toHaveProperty("imdb_votes");
    expect(update).not.toHaveProperty("rating_checked_at");
    expect(update).not.toHaveProperty("poster_url");
  });

  it("preserves metadata with explicit non-TMDB provenance", () => {
    const update = buildCinemaMovieEnrichmentUpdate(movie({
      poster_url: "https://studio.example/poster.jpg",
      poster_source: "studio",
      synopsis_source: "studio",
      synopsis_generated: "Official synopsis",
      genres: ["Drama"],
      age_rating: "15",
    }), {
      id: 10,
      title: "Odyssea",
      original_title: "Odyssey",
      release_date: "2026-03-01",
      runtime: 172,
      genres: [{ name: "Adventure" }],
      poster_path: "/tmdb.jpg",
      overview: "TMDB synopsis",
      release_dates: {
        results: [{
          iso_3166_1: "CZ",
          release_dates: [{ certification: "12", type: 3 }],
        }],
      },
    });

    expect(update).not.toHaveProperty("poster_url");
    expect(update).not.toHaveProperty("poster_source");
    expect(update).not.toHaveProperty("synopsis_generated");
    expect(update).not.toHaveProperty("synopsis_source");
    expect(update).not.toHaveProperty("genres");
    expect(update).not.toHaveProperty("age_rating");
  });

  it("keeps ENRICH manual-only while source metadata remains canonical", () => {
    const worker = readFileSync(new URL("./cinema-ingestion-worker.ts", import.meta.url), "utf8");
    expect(worker).toContain('type CinemaJobType = "FETCH" | "PARSE" | "RESOLVE" | "SYNC" | "ENRICH"');
    expect(worker).toContain('const processableJobTypes: CinemaJobType[] = ["FETCH", "PARSE", "RESOLVE", "SYNC", "ENRICH"]');
    expect(worker).toContain('case "ENRICH": return processEnrich(db, job)');
    expect(worker).toContain("source_metadata_persisted: true");
    expect(worker).toContain("external_enrichment_requested: 0");
    expect(worker).not.toContain("cinemaMovieEnrichmentConfigured()");
    expect(worker).not.toContain("enrichment_enqueue_errors");
    expect(worker).not.toContain("enqueueMovieEnrichmentAfterSync");
    expect(worker).toContain("patch.poster_source = sourceId");
    expect(worker).toContain("patch.original_title = originalTitle");
    expect(worker).toContain("director,lead_actors");
  });
});
