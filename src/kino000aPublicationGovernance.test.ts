import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const materializer = source("../api/_shared/cinema-daily-candidate-publication.ts");
const route = source("../api/cinema/daily-publish.ts");
const migration = source("../supabase/migrations/20261005090000_kino000p_compact_catalog_store.sql");
const atomicClaimMigration = source("../supabase/migrations/20261005071500_kino000r_atomic_publication_claim.sql");

describe("Kino000P compact cinema publication governance", () => {
  it("keeps Friday Top 10 inventory separate from exact publication authorization", () => {
    expect(migration).toContain("cinema_catalog_movies");
    expect(migration).toContain("cinema_catalog_screenings");
    expect(migration).toContain("rank integer not null check (rank between 1 and 10)");
    expect(migration).toContain("publication_state text not null default 'ready'");
    expect(migration).toContain("'approved'");
    expect(migration).toContain("'published'");
    expect(atomicClaimMigration).toContain("'publishing'");
  });

  it("binds publication to one exact compact catalog movie id", () => {
    expect(materializer).toContain("catalogMovieId: string");
    expect(materializer).toContain("uuid.test(String(input.catalogMovieId ||");
    expect(materializer).toContain('.eq("id", options.input.catalogMovieId)');
    expect(materializer).toContain('movie.publication_state !== "approved"');
    expect(materializer).toContain("cinema_daily_publication_owner_approval_required");
    expect(materializer).toContain('rpc("claim_cinema_catalog_movie_for_publication"');
    expect(materializer).toContain("cinema_daily_publication_claim_failed");
  });

  it("does not accept a batch publication shape", () => {
    expect(materializer).toContain("catalogMovieId: string");
    expect(materializer).not.toContain("candidateIds:");
    expect(materializer).not.toContain("eventIds:");
    expect(route).toContain("cinema_daily_publication_body_invalid");
  });

  it("uses only the compact Friday movie and screening store for Cinema source data", () => {
    expect(materializer).toContain('.from("cinema_catalog_movies")');
    expect(materializer).toContain('.from("cinema_catalog_screenings")');
    expect(materializer).not.toContain('.from("cinema_daily_movie_city_candidates")');
    expect(materializer).not.toContain('.from("cinema_movies")');
    expect(materializer).not.toContain('.from("cinema_screenings")');
  });

  it("finalizes the exact compact movie before downstream Telegram response", () => {
    expect(materializer).toContain('publication_state: "published"');
    expect(materializer).toContain('.eq("id", movie.id).eq("publication_state", "publishing")');
    expect(materializer).toContain("cinema_daily_publication_candidate_finalize_failed");
    expect(materializer).toContain('.eq("publication_state", "publishing")');
    expect(materializer).toContain('publication_state: "approved"');
    expect(route).toContain("publishTelegramCinemaEvent(result.event_id)");
    expect(route).toContain('action: "publish_city_poster_events"');
  });

  it("keeps the atomic claim private to service_role", () => {
    expect(atomicClaimMigration).toContain("security invoker");
    expect(atomicClaimMigration).toContain("and publication_state = 'approved'");
    expect(atomicClaimMigration).toContain("publication_state = 'publishing'");
    expect(atomicClaimMigration).toContain("revoke all on function public.claim_cinema_catalog_movie_for_publication(uuid) from public");
    expect(atomicClaimMigration).toContain("revoke all on function public.claim_cinema_catalog_movie_for_publication(uuid) from anon, authenticated");
    expect(atomicClaimMigration).toContain("grant execute on function public.claim_cinema_catalog_movie_for_publication(uuid) to service_role");
  });
});
