import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = readFileSync(
  new URL("../api/_shared/cinema-weekly-localization-readiness.ts", import.meta.url),
  "utf8",
);

describe("Kino000N weekly localization readiness contract", () => {
  it("reads locked Top-10 candidates and Kino000M localization evidence only", () => {
    expect(runtime).toContain('.from("cinema_weekly_publication_selections")');
    expect(runtime).toContain('.from("cinema_weekly_publication_candidates")');
    expect(runtime).toContain('.from("cinema_weekly_localization_search_results")');
    expect(runtime).toContain('["ranked", "enriching"].includes(String(selection.state))');
    expect(runtime).toContain('candidate.publication_authorized === true');
  });

  it("requires exactly the governed six locales and fails closed on incomplete coverage", () => {
    expect(runtime).toContain("CINEMA_CAPITAL_LOCALIZATION_TARGETS.map");
    expect(runtime).toContain('candidate.locales[locale] !== "matched"');
    expect(runtime).toContain('publication_authorized: false');
  });

  it("is a read-only readiness layer with no publication, translation fabrication, or canonical movie mutation", () => {
    expect(runtime).not.toContain(".insert(");
    expect(runtime).not.toContain(".update(");
    expect(runtime).not.toContain(".upsert(");
    expect(runtime).not.toContain(".rpc(");
    expect(runtime).not.toContain("city_posters_events");
    expect(runtime).not.toContain("telegram");
    expect(runtime).not.toContain("machine_translation");
    expect(runtime).not.toContain('.from("cinema_movies")');
  });
});
