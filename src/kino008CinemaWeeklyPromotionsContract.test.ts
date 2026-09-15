import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/20260915113000_cinema_weekly_selection_promotions_miniapp.sql", import.meta.url),
  "utf8",
);
const catalogFix = readFileSync(
  new URL("../supabase/migrations/20260915114000_cinema_weekly_selection_catalog_empty_fix.sql", import.meta.url),
  "utf8",
);
const dispatcher = source("../api/_shared/cinema-publication-approval.ts");
const api = source("../api/cinema/approval.ts");
const promotions = source("../api/_shared/cinema-adapters/cinestar-promotions.ts");
const register = source("../api/_shared/cinema-adapters/register.ts");
const appEntry = source("./app-entry.ts");
const miniApp = source("./cinema-approval/CinemaApprovalPage.tsx");

describe("Cinema weekly selection + promotions contract", () => {
  it("selects movie candidates for next Prague Mon-Sun and defaults to a bounded top list", () => {
    expect(migration).toContain("date_trunc('week', now() at time zone 'Europe/Prague')::date + 7");
    expect(migration).toContain("v_week_end := v_week_start + 6");
    expect(migration).toContain("group by st.movie_id");
    expect(migration).toContain("r.candidate_rank <= 8");
    expect(migration).toContain("g.imdb_rating >= 8");
    expect(migration).toContain("g.imdb_votes >= 100000");
    expect(migration).toContain("has_dolby");
  });

  it("keeps all screenings canonical but filters City Posters to approved movie ids for covered weeks", () => {
    expect(migration).toContain("v_sync_run_id := public.cinema_apply_parse_run(v_approval.parse_run_id)");
    expect(catalogFix).toContain("from public.cinema_screenings s");
    expect(catalogFix).toContain("a.selection_week_start");
    expect(catalogFix).toContain("sel.selected = true");
    expect(catalogFix).toContain("sel.movie_id = s.movie_id");
    expect(catalogFix).not.toContain("from public.activities");
  });

  it("treats CineStar /akce as auxiliary discount detection, never schedule authority", () => {
    expect(promotions).toContain('new URL("akce", root)');
    expect(promotions).toContain("discount_promotions");
    expect(promotions).toContain("promotion fetch is best-effort");
    expect(promotions).toContain("schedulePayload(payload)");
    expect(promotions).toContain("kč${czkEnd}");
    expect(register).toContain("withCineStarPromotions(cinestarCzAdapter)");
  });

  it("creates Activities only for selected discount promotions with a real legacy time anchor", () => {
    expect(migration).toContain("cinema_publication_approval_promotions");
    expect(migration).toContain("and selected = true");
    expect(migration).toContain("insert into public.activities");
    expect(migration).toContain("event_end_date");
    expect(migration).toContain("event_all_day");
    expect(migration).toContain("select min((s.starts_at at time zone");
    expect(migration).toContain("cinema promotion missing real screening anchor time");
    expect(migration).toContain("'system:cinema-promotions'");
    expect(migration).toContain("cinema_promotion_publications");
  });

  it("auto-publishes approved promotion Activities through the existing city Telegram path", () => {
    expect(api).toContain('.from("cinema_promotion_publications")');
    expect(api).toContain('/functions/v1/telegramEventSupergroup');
    expect(api).toContain('action: "publish_city_activity"');
    expect(api).toContain('Authorization: `Bearer ${serviceRoleKey}`');
    expect(api).toContain("promotionActivityPosts");
  });

  it("opens approval inside Telegram Mini App and removes legacy PUBLIC_APP_ORIGIN from this flow", () => {
    expect(dispatcher).toContain('web_app: { url: reviewUrl }');
    expect(dispatcher).toContain('/cinema/approval?token=');
    expect(dispatcher).not.toContain("PUBLIC_APP_ORIGIN");
    expect(appEntry).toContain('normalizedPath === "/cinema/approval"');
    expect(miniApp).toContain("Опубликовать выбранное");
    expect(miniApp).toContain("Акции со скидкой");
  });

  it("reviews selections through preview + POST decision before the one-time approval claim", () => {
    expect(api).toContain('mode === "preview"');
    expect(api).toContain('["GET", "POST"].includes(request.method)');
    expect(api).toContain('cinema_update_publication_selection');
    expect(api).toContain('cinema_claim_publication_decision');
    expect(api).toContain('cinema_apply_publication_approval');
    expect(migration).toContain("grant execute on function public.cinema_update_publication_selection(uuid,text,uuid[],text[]) to service_role");
    expect(migration).toContain("grant execute on function public.cinema_apply_publication_approval(uuid) to service_role");
  });
});