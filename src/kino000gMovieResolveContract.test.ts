import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync(new URL("../api/_shared/cinema-ingestion-worker.ts", import.meta.url), "utf8");
const resolverMigration = readFileSync(
  new URL("../supabase/migrations/20260912214212_cinema_cross_source_movie_resolution.sql", import.meta.url),
  "utf8",
);

describe("Kino000G worker resolve/dedup contract", () => {
  it("keeps exact source provenance as the first resolver gate", () => {
    const start = worker.indexOf("const resolveMovie = async");
    const body = worker.slice(start, worker.indexOf("const persistMovieMetadata", start));
    const mapped = body.indexOf("const mapped = await exactSourceMapping");
    const fingerprint = body.indexOf('eq("movie_fingerprint", row.movie_fingerprint)');
    const canonical = body.indexOf("selectCanonicalMovieMatch");
    expect(mapped).toBeGreaterThan(-1);
    expect(fingerprint).toBeGreaterThan(mapped);
    expect(canonical).toBeGreaterThan(fingerprint);
  });

  it("quarantines ambiguous canonical matches instead of choosing one", () => {
    expect(worker).toContain('if (decision.status === "ambiguous") return { error: "ambiguous_movie_match" }');
  });

  it("retains the transactional DB concurrency/idempotency guard for create/reuse", () => {
    expect(worker).toContain('db.rpc("cinema_resolve_or_create_movie"');
    expect(resolverMigration).toContain("pg_advisory_xact_lock");
    expect(resolverMigration).toContain("on conflict (movie_fingerprint)");
    expect(resolverMigration).toContain("on conflict (source_id, external_movie_id)");
  });

  it("never fuzzy-merges a source row without sufficient canonical identity", () => {
    expect(worker).toContain('return { error: "canonical_movie_identity_insufficient" }');
  });
});
