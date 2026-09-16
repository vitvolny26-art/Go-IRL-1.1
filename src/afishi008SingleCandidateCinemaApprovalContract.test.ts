import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const dispatcher = source("../api/_shared/cinema-publication-approval.ts");
const endpoint = source("../api/cinema/approval.ts");
const page = source("./cinema-approval/CinemaApprovalPage.tsx");
const migration = source("../supabase/migrations/20260916160000_afishi008_single_candidate_cinema_approval.sql");

describe("AFISHI008 single-candidate cinema approval", () => {
  it("allows only one open Telegram candidate at a time", () => {
    expect(migration).toContain("cinema_publication_approval_movies_one_open_candidate_idx");
    expect(migration).toContain("candidate_status in ('sending','sent')");
    expect(dispatcher).toContain('blocked: "candidate_waiting_for_decision"');
    expect(dispatcher).toContain("options.limit ?? 1");
    expect(dispatcher).toContain('"Открыть кандидата"');
    expect(dispatcher).not.toContain("Подборка кино готова к проверке");
  });

  it("stores approval tokens and state on the movie candidate, not the parent batch", () => {
    expect(migration).toContain("add column if not exists candidate_status");
    expect(migration).toContain("add column if not exists approve_token_hash");
    expect(migration).toContain("add column if not exists reject_token_hash");
    expect(endpoint).toContain('db.rpc("cinema_claim_publication_movie_decision"');
    expect(endpoint).not.toContain('db.rpc("cinema_claim_publication_decision"');
  });

  it("applies the canonical parse run once and never publishes promotions from the approval path", () => {
    expect(migration).toContain("public.cinema_apply_parse_run(v_approval.parse_run_id)");
    expect(migration).not.toContain("insert into public.activities");
    expect(endpoint).not.toContain("publishPromotionActivities");
    expect(endpoint).not.toContain("telegramEventSupergroup");
  });

  it("keeps the review UI scoped to exactly one movie", () => {
    expect(page).toContain("movie: MovieCandidate");
    expect(page).toContain("Подтвердить фильм");
    expect(page).toContain("Пропустить фильм");
    expect(page).not.toContain("Опубликовать выбранное");
    expect(page).not.toContain("Акции со скидкой");
  });

  it("dispatches the next candidate only after the current decision", () => {
    expect(endpoint).toContain("dispatchPendingCinemaPublicationApprovals(db, { limit: 1 })");
    expect(page).toContain("Следующий кандидат придёт отдельным сообщением в Telegram");
  });
});
