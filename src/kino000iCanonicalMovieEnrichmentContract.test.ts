import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const enrichment = readFileSync(
  new URL("../api/_shared/cinema-movie-enrichment.ts", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../api/_shared/cinema-ingestion-worker.ts", import.meta.url),
  "utf8",
);

describe("Kino000I enrichment worker contract", () => {
  it("keeps provider errors non-fatal to ingestion", () => {
    expect(enrichment).toContain('status: "provider_error"');
    expect(enrichment).toContain('catch {');
    expect(worker).toContain('if (result.status !== "matched")');
    expect(worker).toContain('skipped: result.status');
  });

  it("requires title identity and bounds duration conflicts", () => {
    expect(enrichment).toContain("titleIdentityMatches");
    expect(enrichment).toContain("runtimeToleranceMinutes = 15");
    expect(enrichment).toContain('status: "mismatch"');
  });

  it("preserves explicit poster and synopsis provenance", () => {
    expect(enrichment).toContain('movie.poster_source === "tmdb"');
    expect(enrichment).toContain('movie.synopsis_source === "tmdb"');
    expect(enrichment).toContain('update.poster_source = "tmdb"');
    expect(enrichment).toContain('update.synopsis_source = "tmdb"');
  });

  it("stores TMDB identity without introducing a schema migration", () => {
    expect(enrichment).toContain("externalIds.tmdb");
    expect(enrichment).toContain("external_ids");
  });
});
