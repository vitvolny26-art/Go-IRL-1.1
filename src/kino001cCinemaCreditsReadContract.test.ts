import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = source("../supabase/migrations/20260925023000_kino001c_cinema_credits_read_contract.sql");
const model = source("./city-posters/cinema/cinemaModel.ts");
const catalog = source("./city-posters/cinema/CinemaPostersCatalog.tsx");
const enrichment = source("../api/_shared/cinema-movie-enrichment.ts");
const worker = source("../api/_shared/cinema-ingestion-worker.ts");

describe("Kino001C director/cast schema and read contract", () => {
  it("adds bounded cinema movie credit fields with an array invariant", () => {
    expect(migration).toContain("add column if not exists director text");
    expect(migration).toContain("add column if not exists lead_actors jsonb not null default '[]'::jsonb");
    expect(migration).toContain("cinema_movies_lead_actors_array_check");
    expect(migration).toContain("jsonb_typeof(lead_actors) = 'array'");
  });

  it("recreates the public catalog projection with the same access boundary plus credits", () => {
    expect(migration).toContain("drop function if exists public.city_posters_cinema_catalog(text, integer)");
    expect(migration).toContain("director text");
    expect(migration).toContain("lead_actors jsonb");
    expect(migration).toContain("m.director");
    expect(migration).toContain("m.lead_actors");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("revoke all on function public.city_posters_cinema_catalog(text, integer) from public");
    expect(migration).toContain("grant execute on function public.city_posters_cinema_catalog(text, integer) to anon, authenticated, service_role");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  it("moves credits into the canonical client read model instead of a Details-only cast", () => {
    expect(model).toContain("director: string | null");
    expect(model).toContain("lead_actors: unknown");
    expect(catalog).not.toContain("type CinemaDetailRow");
    expect(catalog).toContain('const director = String(row.director || "").trim()');
    expect(catalog).toContain("cinemaStringList(row.lead_actors).slice(0, 5)");
  });

  it("keeps TMDB manual-only while the canonical worker persists official-source credits", () => {
    expect(enrichment).toContain('append_to_response", "release_dates,credits"');
    expect(enrichment).toContain('=== "director"');
    expect(enrichment).toContain("update.director = directorName");
    expect(enrichment).toContain("update.lead_actors = leadActors");
    expect(worker).toContain("synopsis_generated,director,lead_actors,external_ids");
    expect(worker).toContain("patch.director = director");
    expect(worker).toContain("patch.lead_actors = leadActors");
    expect(worker).toContain("source_metadata_persisted: true");
    expect(worker).toContain("external_enrichment_requested: 0");
    expect(worker).not.toContain("enqueueMovieEnrichmentAfterSync");
  });
});
