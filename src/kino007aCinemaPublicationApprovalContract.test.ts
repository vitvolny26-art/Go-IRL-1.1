import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const worker = source("../api/_shared/cinema-ingestion-worker.ts");
const approval = source("../api/_shared/cinema-publication-approval.ts");
const endpoint = source("../api/cinema/approval.ts");
const vercel = source("../vercel.json");
const migration = source("../supabase/migrations/20260914213000_kino007a_city_posters_cinema_semi_auto_approval.sql");
const manualDispatchMigration = source("../supabase/migrations/20260915091500_kino007a_manual_dispatch_helper.sql");
const catalogMigration = source("../supabase/migrations/20260914130000_city_posters_cinema_public_catalog.sql");
const weeklyMigration = source("../supabase/migrations/20260915113000_cinema_weekly_selection_promotions_miniapp.sql");
const singleCandidateMigration = source("../supabase/migrations/20260916160000_afishi008_single_candidate_cinema_approval.sql");

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

  it("uses the configured ready Telegram communication route for one private candidate", () => {
    expect(approval).toContain('.from("communication_routes")');
    expect(approval).toContain('.eq("channel", "telegram")');
    expect(approval).toContain('["outbound", "notification"]');
    expect(approval).toContain('"Открыть кандидата"');
    expect(approval).toContain("web_app: { url: reviewUrl }");
    expect(approval).not.toContain("Подборка кино готова к проверке");
    expect(approval).toContain("options.limit ?? 1");
    expect(endpoint).toContain("outside_sunday_evening_window");
    expect(endpoint).toContain('timeZone: "Europe/Prague"');
  });

  it("makes one movie decision and applies the canonical cinema parse run only on the first approve", () => {
    expect(singleCandidateMigration).toContain("cinema_claim_publication_movie_decision");
    expect(singleCandidateMigration).toContain("candidate_status in ('sending','sent')");
    expect(singleCandidateMigration).toContain("public.cinema_apply_parse_run(v_approval.parse_run_id)");
    expect(endpoint).toContain('db.rpc("cinema_claim_publication_movie_decision"');
    expect(endpoint).not.toContain('db.rpc("cinema_apply_publication_approval"');
    expect(endpoint).not.toContain('db.rpc("cinema_finish_publication_approval"');
  });

  it("keeps public approval URLs while using one Vercel serverless handler", () => {
    expect(vercel).toContain('"source": "/api/cinema/approval/run"');
    expect(vercel).toContain('"destination": "/api/cinema/approval?mode=run"');
    expect(vercel).toContain('"source": "/api/cinema/approval/decision"');
    expect(vercel).toContain('"destination": "/api/cinema/approval?mode=decision"');
    expect(endpoint).toContain('if (mode === "run") return handleRun(request);');
    expect(endpoint).toContain('if (mode === "preview") return handlePreview(request);');
    expect(endpoint).toContain('if (mode === "decision") return handleDecision(request);');
  });

  it("accepts the relative request URLs emitted by Vercel rewrites", () => {
    expect(endpoint).toContain('new URL(request.url, "https://goirl.invalid")');
    expect(endpoint).toContain("const url = parseRequestUrl(request);");
  });

  it("uses Vercel's Web-standard fetch signature for the combined handler", () => {
    expect(endpoint).toContain("export default {");
    expect(endpoint).toContain("fetch(request: Request)");
    expect(endpoint).toContain("return handleCinemaApproval(request);");
    expect(endpoint).not.toContain("export default handleCinemaApproval;");
  });

  it("keeps manual dispatch bounded to one pending approval and the fixed production route", () => {
    expect(manualDispatchMigration).toContain("go_irl_dispatch_cinema_publication_approval");
    expect(manualDispatchMigration).toContain("if v_pending_count <> 1");
    expect(manualDispatchMigration).toContain("approval.id = p_approval_id");
    expect(manualDispatchMigration).toContain("approval.status = 'pending'");
    expect(manualDispatchMigration).toContain("vault.decrypted_secrets");
    expect(manualDispatchMigration).toContain("https://go-irl-1-1.vercel.app/api/cinema/approval/run");
    expect(manualDispatchMigration).toContain("jsonb_build_object('force', true, 'limit', 1)");
    expect(manualDispatchMigration).toContain("to service_role;");
    expect(manualDispatchMigration).not.toContain("cron.schedule");
  });

  it("keeps movie publication in City Posters Cinema and removes promotion delivery from the approval API", () => {
    expect(catalogMigration).toContain("city_posters_cinema_catalog");
    expect(catalogMigration).toContain("from public.cinema_screenings s");
    expect(catalogMigration).toContain("sr.is_complete = true");
    expect(approval).not.toContain('.from("activities")');
    expect(endpoint).not.toContain('.from("activities")');
    expect(endpoint).not.toContain("telegramEventSupergroup");
    expect(singleCandidateMigration).not.toContain("insert into public.activities");
    expect(weeklyMigration).toContain("cinema_publication_approval_promotions");
  });
});
