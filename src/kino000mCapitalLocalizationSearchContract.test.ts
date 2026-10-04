import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const search = source("../api/_shared/cinema-capital-localization-search.ts");
const runtime = source("../api/_shared/cinema-capital-localization-runtime.ts");
const migration = source("../supabase/migrations/20261004172500_kino000m_capital_localization_search.sql");

describe("Kino000M capital localization search contract", () => {
  it("binds exactly the six requested language/capital markets", () => {
    for (const pair of [
      'locale: "ru", language: "Russian", capital: "Moscow"',
      'locale: "uk", language: "Ukrainian", capital: "Kyiv"',
      'locale: "cs", language: "Czech", capital: "Prague"',
      'locale: "en", language: "English", capital: "London"',
      'locale: "pl", language: "Polish", capital: "Warsaw"',
      'locale: "sk", language: "Slovak", capital: "Bratislava"',
    ]) expect(search).toContain(pair);
  });

  it("operates only on locked Top-10 weekly inventory before publication authorization", () => {
    expect(runtime).toContain('["ranked", "enriching"].includes(String(selection.state))');
    expect(runtime).toContain("!selection.locked_at");
    expect(runtime).toContain('.lte("rank", Number(selection.top_limit))');
    expect(runtime).toContain("candidate.publication_authorized === true");
  });

  it("uses external identity first, then exact title+year with bounded runtime compatibility and fail-closed ambiguity", () => {
    expect(search).toContain("externalIdentity(movie, candidate).exact");
    expect(search).toContain("movie.release_year !== candidate.release_year");
    expect(search).toContain("runtimeToleranceMinutes = 15");
    expect(search).toContain('status: "ambiguous"');
    expect(search).toContain('status: "mismatch"');
    expect(search).toContain('status: "not_found"');
  });

  it("stores provenance separately and never writes canonical cinema_movies", () => {
    expect(runtime).toContain('.from("cinema_weekly_localization_search_results")');
    expect(runtime).not.toContain('.from("cinema_movies").update');
    expect(migration).toContain("source_url text");
    expect(migration).toContain("source_name text");
    expect(migration).toContain("source_kind text");
    expect(migration).toContain("confidence numeric");
    expect(migration).toContain("match_basis text");
  });

  it("does not treat machine translation as a searched localization source or authorize publication", () => {
    expect(search).not.toContain("machine_translation");
    expect(migration).not.toContain("publication_authorized");
    expect(runtime).not.toContain("telegram");
    expect(runtime).not.toContain("city_posters_events");
  });

  it("keeps search-result storage service-role only", () => {
    expect(migration).toContain("revoke all on public.cinema_weekly_localization_search_results from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on public.cinema_weekly_localization_search_results to service_role");
  });
});
