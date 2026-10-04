import assert from "node:assert/strict";
import { expect, test } from "vitest";
import { buildDailyMovieCityCandidates } from "./cinema-daily-candidates.js";

const row = (overrides: Record<string, unknown> = {}) => ({
  screening_id: "screening-1",
  movie_id: "movie-1",
  city_id: "prague",
  city_name: "Prague",
  venue_id: "venue-1",
  cinema_name: "Cinema One",
  title: "Odyssea",
  local_date: "2026-09-24",
  format: null,
  audio_type: null,
  version_type: null,
  screening_tags: [],
  release_year: 2026,
  imdb_rating: null,
  imdb_votes: null,
  active: true,
  ...overrides,
});

test("aggregates one canonical movie+city candidate with deterministic showing window and sets", () => {
  const candidates = buildDailyMovieCityCandidates([
    row({ screening_id: "s3", local_date: "2026-10-26", venue_id: "v2", cinema_name: "B" }),
    row({ screening_id: "s1", local_date: "2026-09-24", venue_id: "v1", cinema_name: "A" }),
    row({ screening_id: "s2", local_date: "2026-10-01", venue_id: "v1", cinema_name: "A" }),
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].showing_from, "2026-09-24");
  assert.equal(candidates[0].showing_until, "2026-10-26");
  assert.equal(candidates[0].screening_count, 3);
  assert.equal(candidates[0].day_count, 3);
  assert.deepEqual(candidates[0].cinemas, ["A", "B"]);
  assert.deepEqual(candidates[0].venue_ids, ["v1", "v2"]);
});

test("deduplicates the same canonical screening id before counts and scoring", () => {
  const candidates = buildDailyMovieCityCandidates([
    row({ screening_id: "same" }),
    row({ screening_id: "same" }),
  ]);
  assert.equal(candidates[0].screening_count, 1);
  assert.equal(candidates[0].day_count, 1);
});

test("keeps the same movie in different cities as separate candidates", () => {
  const candidates = buildDailyMovieCityCandidates([
    row({ screening_id: "p1" }),
    row({
      screening_id: "w1",
      city_id: "warsaw",
      city_name: "Warsaw",
      venue_id: "w1",
      cinema_name: "W",
    }),
  ]);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map((item) => item.city_id).sort(), ["prague", "warsaw"]);
});

test("ports deterministic governed score factors into daily movie+city triage", () => {
  const screenings = Array.from({ length: 10 }, (_, index) => row({
    screening_id: `s-${index}`,
    local_date: `2026-10-${String((index % 5) + 1).padStart(2, "0")}`,
    format: index === 0 ? "4k" : null,
    audio_type: index === 1 ? "Dolby Atmos" : null,
    version_type: index === 2 ? "ORIGINAL" : null,
    screening_tags: index === 3 ? ["d-box"] : [],
    imdb_rating: 8.2,
    imdb_votes: 120000,
    title: "Odyssea PREMIÉRA",
  }));
  const [candidate] = buildDailyMovieCityCandidates(screenings);
  assert.equal(candidate.score, 115);
  assert.equal(candidate.priority, "high_priority");
  assert.equal(candidate.reasons.has4k, true);
  assert.equal(candidate.reasons.hasDolby, true);
  assert.equal(candidate.reasons.hasDbox, true);
  assert.equal(candidate.reasons.hasOriginal, true);
  assert.equal(candidate.reasons.specialTitle, true);
});

test("is invariant to screening input order", () => {
  const input = [
    row({ screening_id: "b", local_date: "2026-10-02", venue_id: "v2", cinema_name: "B", format: "4K" }),
    row({ screening_id: "a", local_date: "2026-10-01", venue_id: "v1", cinema_name: "A" }),
  ];
  expect(buildDailyMovieCityCandidates(input)).toEqual(buildDailyMovieCityCandidates([...input].reverse()));
});

test("fails closed on conflicting canonical movie or city metadata", () => {
  expect(() => buildDailyMovieCityCandidates([
    row({ screening_id: "a" }),
    row({ screening_id: "b", title: "Different title" }),
  ])).toThrow(/cinema_candidate_title_conflict/);

  expect(() => buildDailyMovieCityCandidates([
    row({ screening_id: "a" }),
    row({ screening_id: "b", city_name: "Different city" }),
  ])).toThrow(/cinema_candidate_city_name_conflict/);

  expect(() => buildDailyMovieCityCandidates([
    row({ screening_id: "a", release_year: 2026 }),
    row({ screening_id: "b", release_year: 2025 }),
  ])).toThrow(/cinema_candidate_release_year_conflict/);
});

test("ignores inactive rows and rejects malformed canonical identities or local dates", () => {
  assert.equal(buildDailyMovieCityCandidates([row({ active: false })]).length, 0);
  assert.throws(() => buildDailyMovieCityCandidates([row({ city_id: "" })]), /cinema_candidate_identity_incomplete/);
  assert.throws(() => buildDailyMovieCityCandidates([row({ local_date: "2026/09/24" })]), /cinema_candidate_identity_incomplete/);
});
