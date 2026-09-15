import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const worker = source("../api/_shared/cinema-ingestion-worker.ts");
const approval = source("../api/_shared/cinema-publication-approval.ts");
const run = source("../api/cinema/approval/run.ts");
const decision = source("../api/cinema/approval/decision.ts");
const migration = source("../supabase/migrations/20260914213000_kino007a_city_posters_cinema_semi_auto_approval.sql");
const catalogMigration = source("../supabase/migrations/20260914130000_city_posters_cinema_public_catalog.sql");

describe("Kino007A City Posters Cinema semi-auto approval", () => {
  it("gates the existing RESOLVE -> SYNC transition without replacing the ingestion worker", () => {
    expect(worker).toContain('job_type: "SYNC"');
    expect(migration).toContain("kino007a_gate_sync_for_approval");
    expect(migration).toContain("before insert on public.cinema_ingestion_jobs");
    expect(migration).toContain("new.job_type <> 'SYNC'");
    expect(migration).toContain("return null;");
  });

  it("is inactive by default and does not mutate any source enabled state", () => {
    expect(migration).toContain("cinema_publication_approval_sources");
    expect(migration).toContain("active boolean not null default false");
    expect(migration).not.toContain("update public.cinema_sources");
    expect(migration).not.toContain("insert into public.cinema_publication_approval_sources");
    expect(approval).toContain("CINEMA_PUBLICATION_APPROVAL_ENABLED");
  });

  it("uses the configured ready Telegram communication route for the private Sunday prompt", () => {
    expect(approval).toContain('.from("communication_routes")');
    expect(approval).toContain('.eq("channel", "telegram")');
    expect(approval).toContain('["outbound", "notification"]');
    expect(approval).toContain('"Опубликовать"');
    expect(approval).toContain('"Не публиковать"');
    expect(run).toContain("outside_sunday_evening_window");
    expect(run).toContain('timeZone: "Europe/Prague"');
  });

  it("makes a one-time decision before atomically applying the canonical cinema parse run", () => {
    expect(migration).toContain("cinema_claim_publication_decision");
    expect(migration).toContain("'applying'");
    expect(migration).toContain("parse_run_id uuid not null unique");
    expect(decision).toContain('db.rpc("cinema_apply_parse_run"');
    expect(decision).toContain('db.rpc("cinema_finish_publication_approval"');
  });

  it("publishes through City Posters Cinema and never creates an Activity", () => {
    expect(catalogMigration).toContain("city_posters_cinema_catalog");
    expect(catalogMigration).toContain("from public.cinema_screenings s");
    expect(catalogMigration).toContain("sr.is_complete = true");
    expect(approval).not.toContain('.from("activities")');
    expect(decision).not.toContain('.from("activities")');
    expect(migration).not.toContain("city_posters_events");
    expect(migration).not.toContain("public.activities");
  });
});
