import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const materializer = source("../api/_shared/cinema-daily-candidate-publication.ts");
const route = source("../api/cinema/daily-publish.ts");
const telegram = source("../supabase/functions/telegramEventSupergroup/cityPostersPublication.ts");

describe("AFISHI000A daily Cinema publication boundary", () => {
  it("publishes only an exact active+approved daily identity through admin authorization", () => {
    expect(route).toContain("authorizeAdminRequest(request, productionAdminAuthorizationDependencies())");
    expect(materializer).toContain('.from("cinema_daily_movie_city_candidates")');
    expect(materializer).toContain('candidate.lifecycle_status !== "active" || candidate.decision_status !== "approved"');
    expect(materializer).toContain("cinema_daily_publication_identity_mismatch");
    expect(materializer).toContain("cinema_daily_publication_schedule_changed");
  });

  it("requires an explicit poster package and six first-class translations", () => {
    expect(materializer).toContain('["ru", "uk", "cs", "en", "pl", "sk"]');
    expect(materializer).toContain("cinema_daily_publication_poster_invalid");
    expect(materializer).toContain("cinema_daily_publication_translation_missing");
    expect(materializer).toContain('source_kind: "machine"');
    expect(materializer).toContain("verified: false");
  });

  it("materializes canonical City Posters venue, event and concrete screening occurrences idempotently", () => {
    expect(materializer).toContain('.from("city_posters_venues")');
    expect(materializer).toContain('.from("city_posters_events")');
    expect(materializer).toContain('.from("city_posters_event_translations")');
    expect(materializer).toContain('.from("city_posters_occurrences")');
    expect(materializer).toContain("cinemaDailyScreeningId");
    expect(materializer).toContain('status: "ready"');
    expect(materializer).toContain('status: "published"');
    expect(materializer).not.toContain('from("activities")');
  });

  it("auto-publishes Cinema to the city Telegram culture topic with the full showing range", () => {
    expect(materializer).toContain("telegram_auto_publish: true");
    expect(materializer).toContain('telegram_topic_kind: "culture"');
    expect(materializer).toContain('provider_distribution: { telegram: "automatic" }');
    expect(materializer).toContain("provider_distribution_authorized: true");
    expect(route).toContain("publishTelegramCinemaEvent(result.event_id)");
    expect(route).toContain('action: "publish_city_poster_events"');
    expect(telegram).toContain("formatDateOnlyRange");
    expect(telegram).toContain("cinemaDaily?.showingFrom");
    expect(telegram).toContain("cinemaDaily?.showingUntil");
  });
});
