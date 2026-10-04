import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const materializer = source("../api/_shared/cinema-daily-candidate-publication.ts");
const route = source("../api/cinema/daily-publish.ts");
const migration = source("../supabase/migrations/20261004130000_kino000a_weekly_publication_governance.sql");

describe("Kino000A weekly cinema publication governance", () => {
  it("keeps weekly Top 10 inventory separate from publication authorization", () => {
    expect(migration).toContain("cinema_weekly_publication_selections");
    expect(migration).toContain("cinema_weekly_publication_candidates");
    expect(migration).toContain("publication_authorized boolean not null default false");
    expect(migration).toContain("rank between 1 and 10");
    expect(migration).toContain("top_limit between 1 and 10");
  });

  it("allows at most one open owner-approved candidate per weekly selection", () => {
    expect(migration).toContain("cinema_weekly_publication_one_open_approval_idx");
    expect(migration).toContain("where status = 'approved' and consumed_at is null");
    expect(migration).toContain("cinema weekly publication another candidate waiting");
  });

  it("binds approval to the exact selection, candidate, movie, city and showing window", () => {
    expect(materializer).toContain("weeklySelectionId: string");
    expect(materializer).toContain("approvalId: string");
    expect(materializer).toContain('rpc("cinema_check_weekly_publication_approval"');
    expect(materializer).toContain("p_weekly_selection_id: options.input.weeklySelectionId");
    expect(materializer).toContain("p_candidate_id: options.input.candidateId");
    expect(materializer).toContain("p_movie_id: options.input.expected.movieId");
    expect(materializer).toContain("p_showing_from: options.input.expected.showingFrom");
    expect(materializer).toContain("p_showing_until: options.input.expected.showingUntil");
  });

  it("rejects batch-shaped cinema publication input", () => {
    expect(materializer).toContain('"candidateIds" in raw || "eventIds" in raw');
    expect(materializer).toContain("cinema_daily_publication_batch_forbidden");
    expect(route).toContain("batch_forbidden");
  });

  it("consumes the exact approval once before downstream Telegram dispatch can be returned", () => {
    expect(materializer).toContain('rpc("cinema_consume_weekly_publication_approval"');
    expect(materializer).toContain("cinema_daily_publication_approval_already_consumed");
    expect(migration).toContain("status = 'consumed'");
    expect(migration).toContain("state = 'waiting_next_approval'");
    expect(route).toContain("publishTelegramCinemaEvent(result.event_id)");
  });
});
