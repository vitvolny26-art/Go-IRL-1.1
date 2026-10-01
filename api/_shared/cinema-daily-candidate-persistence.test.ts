import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, vi } from "vitest";
import { persistDailyMovieCityCandidates } from "./cinema-daily-candidate-persistence.js";
import type { CinemaDailyMovieCityCandidate } from "./cinema-daily-candidates.js";

const candidate = (overrides: Partial<CinemaDailyMovieCityCandidate> = {}): CinemaDailyMovieCityCandidate => ({
  movie_id: "11111111-1111-4111-8111-111111111111",
  city_id: "olomouc",
  city_name: "Olomouc",
  title: "LINKIN PARK: UNSHATTER",
  showing_from: "2026-09-30",
  showing_until: "2026-10-03",
  screening_count: 2,
  day_count: 2,
  cinemas: ["Premiere Cinemas Olomouc"],
  venue_ids: ["22222222-2222-4222-8222-222222222222"],
  formats: ["2D"],
  audio_types: [],
  version_types: ["subtitled"],
  score: 8,
  priority: "ignore",
  reasons: {
    has4k: false,
    hasDolby: false,
    has3d: false,
    hasDbox: false,
    hasOriginal: false,
    specialTitle: false,
    releaseYear: 2026,
    imdbRating: null,
    imdbVotes: null,
  },
  ...overrides,
});

test("persists an exact city snapshot through the service-role RPC without authorizing publication", async () => {
  const rpc = vi.fn(async () => ({
    data: [{
      candidate_id: "33333333-3333-4333-8333-333333333333",
      movie_id: "11111111-1111-4111-8111-111111111111",
      city_id: "olomouc",
      showing_from: "2026-09-30",
      showing_until: "2026-10-03",
      lifecycle_status: "active",
      decision_status: "pending",
    }],
    error: null,
  }));
  const db = { rpc } as unknown as SupabaseClient;

  const result = await persistDailyMovieCityCandidates({
    db,
    cityId: "olomouc",
    candidates: [candidate()],
    observedAt: new Date("2026-09-30T03:30:00.000Z"),
  });

  expect(rpc).toHaveBeenCalledWith("cinema_persist_daily_movie_city_candidates", {
    p_city_id: "olomouc",
    p_candidates: [expect.objectContaining({
      movie_id: "11111111-1111-4111-8111-111111111111",
      city_id: "olomouc",
      showing_from: "2026-09-30",
      showing_until: "2026-10-03",
      screening_count: 2,
      day_count: 2,
    })],
    p_observed_at: "2026-09-30T03:30:00.000Z",
  });
  assert.equal(result.mode, "movie_city_candidate_persistence");
  assert.equal(result.persistence, "cinema_daily_movie_city_candidates");
  assert.equal(result.publication_authorized, false);
  assert.equal(result.owner_decision_required, true);
  assert.equal(result.persisted_count, 1);
  assert.equal(result.candidates[0].decision_status, "pending");
});

test("allows an empty city snapshot so the RPC can supersede stale active identities", async () => {
  const rpc = vi.fn(async () => ({ data: [], error: null }));
  const db = { rpc } as unknown as SupabaseClient;
  const result = await persistDailyMovieCityCandidates({
    db,
    cityId: "olomouc",
    candidates: [],
    observedAt: new Date("2026-09-30T03:30:00.000Z"),
  });
  assert.equal(result.candidate_count, 0);
  expect(rpc).toHaveBeenCalledWith("cinema_persist_daily_movie_city_candidates", expect.objectContaining({
    p_city_id: "olomouc",
    p_candidates: [],
  }));
});

test("fails closed on cross-city or duplicate movie identities before writing", async () => {
  const rpc = vi.fn();
  const db = { rpc } as unknown as SupabaseClient;

  await expect(persistDailyMovieCityCandidates({
    db,
    cityId: "olomouc",
    candidates: [candidate({ city_id: "prague" })],
  })).rejects.toThrow(/cinema_candidate_city_mismatch/);

  await expect(persistDailyMovieCityCandidates({
    db,
    cityId: "olomouc",
    candidates: [candidate(), candidate({ showing_until: "2026-10-04" })],
  })).rejects.toThrow(/cinema_candidate_duplicate_movie_city/);
  expect(rpc).not.toHaveBeenCalled();
});

test("fails closed when the persistence RPC does not return every exact identity", async () => {
  const rpc = vi.fn(async () => ({ data: [], error: null }));
  const db = { rpc } as unknown as SupabaseClient;
  await expect(persistDailyMovieCityCandidates({
    db,
    cityId: "olomouc",
    candidates: [candidate()],
  })).rejects.toThrow(/cinema_daily_candidate_persist_count_mismatch/);
});
