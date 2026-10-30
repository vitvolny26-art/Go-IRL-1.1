import { describe, expect, it } from "vitest";
import { buildSrCatalogStagingPlan, type SrSourcePackage, type SrVerifiedVenue } from "../api/_shared/cinema-sr-catalog-staging-plan";

const candidate = "title-year-runtime:v srdci divociny||101";
const sourceMovie = "cs_olomouc_premiere:v-srdci-divociny";
const pack = (): SrSourcePackage => ({
  status: "SR_NINE_MOVIE_PACKAGE_PREPARED_NO_WRITE", week_key: "2026-10-22..2026-11-04",
  run_id: "kino-weekly-olomouc-2026-10-29T07:17:57.612Z",
  ready_movie_count: 1, screening_count: 1,
  write_authorized: false, publication_authorized: false, telegram_send_authorized: false,
  movies: [{
    candidate_id: candidate, rank: 1, title: "V srdci divočiny", imdb_id: "tt7526136",
    source_movie_keys: [sourceMovie], showing_from: "2026-10-30", showing_until: "2026-10-30",
    translations: Object.fromEntries(["ru", "uk", "cs", "en", "pl", "sk"].map(l => [l, {
      title: "Movie", description: "Summary", source_kind: "official_cinema",
      source_url: "https://olomouc.premierecinemas.cz/", row_key: `2026-10-22..2026-11-04|${candidate}|${l}`,
    }])),
    screenings: [{
      source_id: "cs_olomouc_premiere", screening_key: "cs_olomouc_premiere|181829",
      candidate_id: candidate, source_movie_key: sourceMovie,
      starts_at: "2026-10-30T14:10:00.000Z",
      ticket_url: "https://olomouc.premierecinemas.cz/vstupenky/181829/",
      source_url: "https://olomouc.premierecinemas.cz/filmy/v-srdci-divociny/",
      cinema_name: "", // Actual #51710 package leaves every cinema name blank.
    }],
  }],
});
const venues = (): SrVerifiedVenue[] => [{
  source_id: "cs_olomouc_premiere", cinema_key: "premiere-olomouc",
  cinema_name: "Verified Premiere Olomouc", cinema_address: null,
  venue_timezone: "Europe/Prague", verified_from_registry: true,
}];

describe("Kino000(SR) no-write catalog staging", () => {
  it("never authorizes a DB write or publication from a valid snapshot", () => {
    const p = buildSrCatalogStagingPlan(pack(), venues());
    expect(p).toMatchObject({
      status: "SR_CATALOG_STAGING_PLAN_NO_WRITE", movie_count: 1, screening_count: 1,
      write_authorized: false, ready_for_catalog_write: false,
      publication_authorized: false, telegram_send_authorized: false,
    });
    expect(p.drafts[0].movie).toMatchObject({
      source_movie_key: candidate, poster_url: null, publication_state: "ready",
    });
    expect(p.drafts[0].screenings[0]).toMatchObject({
      cinema_name: "Verified Premiere Olomouc", cinema_key: "premiere-olomouc",
      source_screening_key: "cs_olomouc_premiere|181829",
    });
  });
  it("blocks nonexistent registry proof and rejects cross-movie source keys", () => {
    const missing = buildSrCatalogStagingPlan(pack(), []);
    expect(missing.blockers).toContain("verified_venue_registry_missing:cs_olomouc_premiere");
    const invalid = pack(); invalid.movies[0].screenings[0].source_movie_key = "cs_olomouc_cinestar:10875";
    expect(() => buildSrCatalogStagingPlan(invalid, venues()))
      .toThrow("cinema_sr_staging_screening_identity_invalid");
  });
  it("does not silently approve controlled translations", () => {
    const x = pack(); x.movies[0].translations.uk.source_kind = "controlled_translation";
    const plan = buildSrCatalogStagingPlan(x, venues());
    expect(plan.blockers).toContain("localization_independent_verification_required:uk");
    expect(plan.drafts[0].movie.readiness.localizations_provenance_verified).toBe(false);
  });
  it("rejects timezone-naive screening times", () => {
    const x = pack(); x.movies[0].screenings[0].starts_at = "2026-10-30T14:10:00";
    const plan = buildSrCatalogStagingPlan(x, venues());
    expect(plan.blockers).toEqual(expect.arrayContaining([
      "screening_timestamp_invalid:cs_olomouc_premiere|181829", "screening_date_range_not_verified",
    ]));
  });
  it("does not invent poster provenance or catalog UUIDs", () => {
    const plan = buildSrCatalogStagingPlan(pack(), venues());
    expect(plan.blockers).toEqual(expect.arrayContaining([
      "canonical_poster_unverified", "source_horizon_completeness_unverified", "catalog_uuid_readback_required",
    ]));
    expect(plan.drafts[0].movie.readiness.verified_source_run_id).toBeNull();
  });
});
