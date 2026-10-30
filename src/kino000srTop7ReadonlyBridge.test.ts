import { describe, expect, it } from "vitest";
import { readSrTop7NextReview, type SrPreviewMovie, type SrPreviewScreening } from "../api/_shared/cinema-sr-top7-readonly-bridge";
const uuid = (i: number) => `e896c63e-8fde-424c-b080-${String(i).padStart(12, "0")}`;
const scope = { week_key: "2026-10-22..2026-11-04", source_run_id: "run-123" };
const langs = ["ru", "uk", "cs", "en", "pl", "sk"];
const movie = (rank: number): SrPreviewMovie => ({
  id: uuid(rank), city_id: "olomouc", selection_week_start: "2026-10-22", selection_week_end: "2026-11-04",
  rank, source_movie_key: `candidate-${rank}`, poster_url: "https://example.com/poster.jpg",
  translations: Object.fromEntries(langs.map(l => [l, { title: "Film", description: "Description" }])),
  readiness: { ready: true, verified_source_run_id: scope.source_run_id, source_identity_verified: true,
    poster_provenance_verified: true, screening_horizon_complete: true, localizations_provenance_verified: true },
  publication_state: "ready",
});
const screening = (i: number): SrPreviewScreening => ({
  catalog_movie_id: uuid(i), source_screening_key: `cinema_${i}|screening_${i}`,
  cinema_key: `cinema_${i}`, source_id: `cinema_${i}`, venue_timezone: "Europe/Prague",
  starts_at: "2026-10-30T14:10:00.000Z", source_url: "https://example.com/screenings",
});
const fixture = () => ({ movies: Array.from({ length: 7 }, (_, i) => movie(i + 1)),
  screenings: Array.from({ length: 7 }, (_, i) => screening(i + 1)), attempts: [] as unknown[] });
const port = (v: ReturnType<typeof fixture>) => ({
  movies: async () => ({ data: v.movies, count: v.movies.length, error: null }),
  screenings: async () => ({ data: v.screenings, count: v.screenings.length, error: null }),
  attempts: async () => ({ data: v.attempts, count: v.attempts.length, error: null }),
});
describe("Kino000(SR) trusted read-only Top7 bridge", () => {
  it("returns just one film for REVIEW without publishing", async () => {
    const r = await readSrTop7NextReview(port(fixture()), scope);
    expect(r).toMatchObject({ sequence_state: "review_next", next_rank: 1,
      next_catalog_movie_id: uuid(1), action: "none", release_enabled: false,
      publication_authorized: false, telegram_send_authorized: false });
  });
  it("blocks on incomplete source or provenance", async () => {
    const v = fixture(); v.movies[0].readiness = { ready: true };
    expect((await readSrTop7NextReview(port(v), scope)).sequence_state).toBe("blocked");
  });
  it("does not turn an unverified successful journal row into proof", async () => {
    const v = fixture(); v.attempts.push({ attempt_id: uuid(25), week_key: scope.week_key,
      source_run_id: scope.source_run_id, rank: 1, catalog_movie_id: uuid(1),
      candidate_key: "candidate-1", status: "succeeded", catalog_event_id: uuid(26),
      telegram_chat_id: -1001, telegram_message_id: 3, provider_outcome: "published",
      independent_receipt: "unverified-string", started_at: "2026-10-30T00:00:00Z",
      finished_at: "2026-10-30T00:01:00Z" });
    expect((await readSrTop7NextReview(port(v), scope)).blockers)
      .toContain("top7_independent_provider_nonreuse_proof_missing");
  });
  it("refuses incomplete exact-count screening result", async () => {
    const v = fixture(); const p = port(v);
    p.screenings = async () => ({ data: v.screenings, count: 10, error: null });
    expect((await readSrTop7NextReview(p, scope)).blockers).toContain("top7_screenings_readback_incomplete");
  });
});
