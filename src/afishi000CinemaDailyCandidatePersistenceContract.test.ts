import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = source("../supabase/migrations/20260930033000_afishi000_daily_movie_city_candidate_persistence.sql");
const persistence = source("../api/_shared/cinema-daily-candidate-persistence.ts");
const worker = source("../scripts/cinema-ingestion-worker.ts");

describe("AFISHI000 daily movie+city candidate persistence", () => {
  it("uses exact movie+city+showing-window identity without changing the legacy weekly approval tables", () => {
    expect(migration).toContain("unique (movie_id, city_id, showing_from, showing_until)");
    expect(migration).toContain("cinema_daily_movie_city_candidates_one_active_window_idx");
    expect(migration).toContain("decision_status text not null default 'pending'");
    expect(migration).toContain("lifecycle_status text not null default 'active'");
    expect(migration).not.toContain("alter table public.cinema_publication_approval_movies");
    expect(migration).not.toContain("alter table public.cinema_publication_approvals");
  });

  it("preserves decisions for an exact identity and supersedes changed or missing active windows", () => {
    expect(migration).toContain("where existing.city_id = p_city_id");
    expect(migration).toContain("existing.lifecycle_status = 'active'");
    expect(migration).toContain("lifecycle_status = 'superseded'");
    expect(migration).toContain("on conflict (movie_id, city_id, showing_from, showing_until)");
    expect(migration).not.toMatch(/do update set[\s\S]*decision_status\s*=/);
  });

  it("keeps the ledger service-role-only and deny-by-default", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.cinema_daily_movie_city_candidates from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on public.cinema_daily_movie_city_candidates to service_role");
    expect(migration).toContain("revoke all on function public.cinema_persist_daily_movie_city_candidates(text,jsonb,timestamptz)");
    expect(migration).toContain("grant execute on function public.cinema_persist_daily_movie_city_candidates(text,jsonb,timestamptz)");
    expect(migration).toContain("to service_role");
  });

  it("adds an explicit persistence runtime path but never publishes or approves automatically", () => {
    expect(persistence).toContain('mode: "movie_city_candidate_persistence"');
    expect(persistence).toContain("publication_authorized: false");
    expect(persistence).toContain("owner_decision_required: true");
    expect(worker).toContain('process.argv.includes("--persist-daily-candidates")');
    expect(worker).toContain("cinema_candidate_persistence_city_required");
    expect(worker).not.toContain("auto_publish");
  });

  it("does not create City Posters publications, activities or sync jobs", () => {
    expect(migration).not.toContain("insert into public.activities");
    expect(migration).not.toContain("insert into public.city_posters_events");
    expect(migration).not.toContain("insert into public.cinema_ingestion_jobs");
    expect(migration).not.toContain("telegramEventSupergroup");
  });
});
