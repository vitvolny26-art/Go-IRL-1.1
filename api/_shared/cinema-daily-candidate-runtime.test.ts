import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, vi } from "vitest";
import { loadDailyMovieCityCandidates } from "./cinema-daily-candidate-runtime.js";

const venue = {
  city_id: "olomouc",
  city_name: "Olomouc",
  name: "Premiere Cinemas Olomouc",
  timezone: "Europe/Prague",
  active: true,
};

const movie = (title: string) => ({
  title,
  release_year: 2026,
  imdb_rating: null,
  imdb_votes: null,
});

const screening = (overrides: Record<string, unknown> = {}) => ({
  id: "screening-1",
  movie_id: "movie-1",
  cinema_id: "venue-1",
  starts_at: "2026-09-30T18:00:00.000Z",
  format: "2D",
  audio_type: null,
  version_type: "subtitled",
  screening_tags: [],
  status: "scheduled",
  cinema_venues: venue,
  cinema_movies: movie("LINKIN PARK: UNSHATTER"),
  ...overrides,
});

function fakeDb(pages: unknown[][]) {
  let page = 0;
  const queries: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  const from = vi.fn((table: string) => {
    if (table !== "cinema_screenings") throw new Error(`unexpected_table:${table}`);
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.gte = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.range = vi.fn(async () => ({ data: pages[page++] ?? [], error: null }));
    queries.push(query);
    return query;
  });
  return { db: { from } as unknown as SupabaseClient, from, queries };
}

test("loads future scheduled canonical screenings and projects movie+city candidates without persistence", async () => {
  const { db, queries } = fakeDb([[screening(), screening({
    id: "screening-2",
    starts_at: "2026-10-03T18:00:00.000Z",
  }), screening({
    id: "screening-3",
    movie_id: "movie-2",
    starts_at: "2026-10-07T18:00:00.000Z",
    format: "4K",
    audio_type: "Dolby Atmos",
    version_type: "original",
    cinema_movies: movie("Queen Budapest"),
  }), screening({
    id: "screening-4",
    movie_id: "movie-2",
    starts_at: "2026-10-11T18:00:00.000Z",
    cinema_movies: movie("Queen Budapest"),
  })]]);

  const result = await loadDailyMovieCityCandidates({
    db,
    now: new Date("2026-09-30T00:00:00.000Z"),
    cityId: "olomouc",
  });

  assert.equal(result.mode, "read_only_movie_city_candidates");
  assert.equal(result.persistence, "none");
  assert.equal(result.publication_authorized, false);
  assert.equal(result.screening_rows, 4);
  assert.equal(result.candidate_count, 2);
  expect(result.candidates.find((item) => item.title === "LINKIN PARK: UNSHATTER")).toMatchObject({
    city_id: "olomouc",
    showing_from: "2026-09-30",
    showing_until: "2026-10-03",
    screening_count: 2,
    day_count: 2,
    cinemas: ["Premiere Cinemas Olomouc"],
  });
  expect(result.candidates.find((item) => item.title === "Queen Budapest")).toMatchObject({
    showing_from: "2026-10-07",
    showing_until: "2026-10-11",
    formats: ["2D", "4K"],
    audio_types: ["Dolby Atmos"],
    version_types: ["original", "subtitled"],
  });

  expect(queries[0].eq).toHaveBeenCalledWith("status", "scheduled");
  expect(queries[0].eq).toHaveBeenCalledWith("cinema_venues.active", true);
  expect(queries[0].eq).toHaveBeenCalledWith("cinema_venues.city_id", "olomouc");
  expect(queries[0].gte).toHaveBeenCalledWith("starts_at", "2026-09-30T00:00:00.000Z");
});

test("paginates instead of silently truncating the canonical screening selection", async () => {
  const { db, queries } = fakeDb([
    [screening({ id: "screening-1" }), screening({ id: "screening-2", starts_at: "2026-10-03T18:00:00.000Z" })],
    [screening({ id: "screening-3", starts_at: "2026-10-04T18:00:00.000Z" })],
  ]);
  const result = await loadDailyMovieCityCandidates({
    db,
    now: new Date("2026-09-30T00:00:00.000Z"),
    cityId: "olomouc",
    pageSize: 2,
  });
  assert.equal(result.screening_rows, 3);
  assert.equal(result.candidate_count, 1);
  expect(queries[0].range).toHaveBeenCalledWith(0, 1);
  expect(queries[1].range).toHaveBeenCalledWith(2, 3);
});

test("fails closed when canonical movie or venue relationships are missing", async () => {
  const { db } = fakeDb([[screening({ cinema_movies: null })]]);
  await expect(loadDailyMovieCityCandidates({
    db,
    now: new Date("2026-09-30T00:00:00.000Z"),
  })).rejects.toThrow(/cinema_candidate_runtime_relation_missing/);
});
