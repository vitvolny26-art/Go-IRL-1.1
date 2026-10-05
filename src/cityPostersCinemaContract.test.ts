import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const page = source("./city-posters/CityPostersPage.tsx");
const catalog = source("./city-posters/cinema/CinemaPostersCatalog.tsx");
const repository = source("./city-posters/cinema/cinemaRepository.ts");
const migration = readFileSync(new URL("../supabase/migrations/20261005090000_kino000p_compact_catalog_store.sql", import.meta.url), "utf8");

describe("City Posters compact Cinema ownership", () => {
  it("keeps Catalog, For You and Details on the existing flat cinema row contract", () => {
    expect(page).toContain('from "./cinema/CinemaPostersCatalog"');
    expect(page).toContain("<CinemaPostersCatalog");
    expect(catalog).toContain("CatalogMovieCard");
    expect(catalog).toContain("ForYouMovieCard");
    expect(catalog).toContain("CinemaMovieDetails");
    expect(repository).toContain('supabase.rpc("city_posters_cinema_catalog"');
    expect(index).not.toContain('/src/cinema/cinema-entry.ts');
  });

  it("backs the guest read RPC only by Friday compact Top-10 movies and their screenings", () => {
    expect(migration).toContain("create table if not exists public.cinema_catalog_movies");
    expect(migration).toContain("create table if not exists public.cinema_catalog_screenings");
    expect(migration).toContain("from public.cinema_catalog_movies m");
    expect(migration).toContain("join public.cinema_catalog_screenings s");
    expect(migration).not.toContain("from public.cinema_screenings s");
    expect(migration).not.toContain("from public.cinema_movies m");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("grant execute on function public.city_posters_cinema_catalog(text, integer) to anon, authenticated, service_role");
  });

  it("preserves all Details fields and screening action fields", () => {
    for (const field of [
      "original_title text",
      "release_year integer",
      "duration_minutes integer",
      "genres jsonb",
      "age_rating text",
      "imdb_rating numeric",
      "poster_url text",
      "description text",
      "director text",
      "lead_actors jsonb",
      "audio_language text",
      "subtitle_languages jsonb",
      "version_type text",
      "format text",
      "auditorium text",
      "screening_tags jsonb",
      "ticket_url text",
      "source_url text",
    ]) expect(migration).toContain(field);
  });
});
