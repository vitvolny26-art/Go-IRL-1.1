import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const materializer = source("../api/_shared/cinema-daily-candidate-publication.ts");
const route = source("../api/cinema/daily-publish.ts");
const telegram = source("../supabase/functions/telegramEventSupergroup/cityPostersPublication.ts");

describe("KINO000P compact Cinema publication boundary", () => {
  it("publishes only one exact approved compact catalog movie through admin authorization", () => {
    expect(route).toContain("authorizeAdminRequest(request, productionAdminAuthorizationDependencies())");
    expect(materializer).toContain('.from("cinema_catalog_movies")');
    expect(materializer).toContain('movie.publication_state !== "approved"');
    expect(materializer).toContain("cinema_daily_publication_owner_approval_required");
    expect(materializer).not.toContain('from("cinema_daily_movie_city_candidates")');
    expect(materializer).not.toContain('from("cinema_movies")');
    expect(materializer).not.toContain('from("cinema_screenings")');
  });

  it("requires Friday readiness, an HTTPS poster and six complete translations", () => {
    expect(materializer).toContain('metadataObject(movie.readiness).ready !== true');
    expect(materializer).toContain("cinema_daily_publication_poster_invalid");
    expect(materializer).toContain('[\"ru\", \"uk\", \"cs\", \"en\", \"pl\", \"sk\"]');
    expect(materializer).toContain("cinema_daily_publication_translation_missing");
  });

  it("materializes every stored Top-10 screening as City Posters occurrences", () => {
    expect(materializer).toContain('.from("cinema_catalog_screenings")');
    expect(materializer).toContain('.from("city_posters_venues")');
    expect(materializer).toContain('.from("city_posters_events")');
    expect(materializer).toContain('.from("city_posters_event_translations")');
    expect(materializer).toContain('.from("city_posters_occurrences")');
    expect(materializer).toContain("cinemaCatalogScreeningKey");
    expect(materializer).not.toContain("selection_week_start &&");
  });

  it("auto-publishes exactly the resulting City Posters event to Telegram", () => {
    expect(materializer).toContain("telegram_auto_publish: true");
    expect(materializer).toContain('telegram_topic_kind: "culture"');
    expect(materializer).toContain('provider_distribution: { telegram: "automatic" }');
    expect(route).toContain("publishTelegramCinemaEvent(result.event_id)");
    expect(route).toContain('action: "publish_city_poster_events"');
    expect(telegram).toContain("publish_city_poster_events");
  });
});
