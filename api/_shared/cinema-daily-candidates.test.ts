import assert from "node:assert/strict";
import { test } from "vitest";
import { buildDailyMovieCityCandidates } from "./cinema-daily-candidates.js";

const row = (overrides: Record<string, unknown> = {}) => ({
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

test("aggregates one movie per city with actual showing window", () => {
  const candidates = buildDailyMovieCityCandidates([
    row({ local_date: "2026-09-24", venue_id: "v1", cinema_name: "A" }),
    row({ local_date: "2026-10-26", venue_id: "v2", cinema_name: "B" }),
    row({ local_date: "2026-10-01", venue_id: "v1", cinema_name: "A" }),
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].showing_from, "2026-09-24");
  assert.equal(candidates[0].showing_until, "2026-10-26");
  assert.equal(candidates[0].screening_count, 3);
  assert.equal(candidates[0].day_count, 3);
  assert.deepEqual(candidates[0].cinemas, ["A", "B"]);
});

test("keeps the same movie in different cities as separate approval candidates", () => {
  const candidates = buildDailyMovieCityCandidates([
    row(),
    row({ city_id: "warsaw", city_name: "Warsaw", venue_id: "w1", cinema_name: "W" }),
  ]);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map((item) => item.city_id).sort(), ["prague", "warsaw"]);
});

test("ports the governed weekly score factors into daily movie+city triage", () => {
  const screenings = Array.from({ length: 10 }, (_, index) => row({
    local_date: `2026-10-${String((index % 5) + 1).padStart(2, "0")}`,
    format: index === 0 ? "4K" : null,
    audio_type: index === 1 ? "Dolby Atmos" : null,
    version_type: index === 2 ? "original" : null,
    screening_tags: index === 3 ? ["D-BOX"] : [],
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

test("ignores inactive schedule rows and rejects incomplete identity", () => {
  assert.equal(buildDailyMovieCityCandidates([row({ active: false })]).length, 0);
  assert.throws(() => buildDailyMovieCityCandidates([row({ city_id: "" })]), /cinema_candidate_identity_incomplete/);
});
