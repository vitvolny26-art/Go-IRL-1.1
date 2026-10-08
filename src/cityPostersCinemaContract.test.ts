import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const page = source("./city-posters/CityPostersPage.tsx");
const catalog = source("./city-posters/cinema/CinemaPostersCatalog.tsx");
const repository = source("./city-posters/cinema/cinemaRepository.ts");
const migration = readFileSync(new URL("../supabase/migrations/20261005090000_kino000p_compact_catalog_store.sql", import.meta.url), "utf8");
const fridayMigration = readFileSync(new URL("../supabase/migrations/20261006143000_kino000p_atomic_friday_catalog_and_localized_read.sql", import.meta.url), "utf8");
const publishedOnlyMigration = readFileSync(new URL("../supabase/migrations/20261007152000_kino000p_published_only_cinema_visibility.sql", import.meta.url), "utf8");
const publishedOnlyHotfixMigration = readFileSync(new URL("../supabase/migrations/20261007172000_kino000p_published_only_cinema_visibility_hotfix.sql", import.meta.url), "utf8");
const readyCatalogRestoreMigration = readFileSync(new URL("../supabase/migrations/20261007183000_kino000p_restore_ready_cinema_catalog_visibility.sql", import.meta.url), "utf8");
const ownerOnlyVisibilityMigration = readFileSync(new URL("../supabase/migrations/20261008003000_kino000r_owner_only_cinema_visibility.sql", import.meta.url), "utf8");
const publicationMaterializer = readFileSync(new URL("../api/_shared/cinema-daily-candidate-publication.ts", import.meta.url), "utf8");

describe("City Posters compact Cinema ownership", () => {
  it("keeps Catalog, For You and Details on the existing flat cinema row contract", () => {
    expect(page).toContain('from "./cinema/CinemaPostersCatalog"');
    expect(page).toContain("<CinemaPostersCatalog");
    expect(catalog).toContain("CatalogMovieCard");
    expect(catalog).toContain("ForYouMovieCard");
    expect(catalog).toContain("CinemaMovieDetails");
    expect(repository).toContain('supabase.rpc("city_posters_cinema_catalog"');
    expect(repository).toContain("p_language: language");
    expect(catalog).toContain('queryKey: ["city-posters", "cinema", cityId, language]');
    expect(catalog).toContain("loadCityPostersCinema(cityId, language)");
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

  it("keeps the historical published-only migrations explicit", () => {
    expect(publishedOnlyMigration).toContain("m.publication_state = 'published'");
    expect(publishedOnlyHotfixMigration).toContain("and m.publication_state = 'published'");
    expect(publishedOnlyHotfixMigration.match(/m\.publication_state = 'published'/g)).toHaveLength(2);
  });

  it("keeps the ready-visibility restore explicit as a historical regression", () => {
    expect(readyCatalogRestoreMigration).toContain("backed by ready Friday Top-10 storage");
    expect(readyCatalogRestoreMigration).toContain("coalesce((m.readiness ->> 'ready')::boolean, false)");
    expect(readyCatalogRestoreMigration).not.toContain("publication_state = 'published'");
  });

  it("keeps guest Cinema surfaces hidden until exact owner publication", () => {
    expect(ownerOnlyVisibilityMigration).toContain("Friday ready Top-10 storage is internal publication inventory");
    expect(ownerOnlyVisibilityMigration.match(/m\.publication_state = 'published'/g)).toHaveLength(2);
    expect(ownerOnlyVisibilityMigration).toContain("only exact owner-published movies are publicly visible");
    expect(ownerOnlyVisibilityMigration).not.toContain("backed by ready Friday Top-10 storage");
  });

  it("keeps Cinema Telegram owner-controlled and dates on the current screening horizon", () => {
    expect(publicationMaterializer).toContain("telegram_auto_publish: false");
    expect(publicationMaterializer).toContain('provider_distribution: { telegram: "owner_exact" }');
    expect(publicationMaterializer).toContain("publicationFloor");
    expect(publicationMaterializer).toContain("relevantScreenings");
  });

  it("localizes title and description from the Friday translation bundle", () => {
    expect(fridayMigration).toContain("p_language text");
    expect(fridayMigration).toContain("m.translations -> lang.language ->> 'title'");
    expect(fridayMigration).toContain("m.translations -> lang.language ->> 'description'");
    expect(fridayMigration).toContain("else 'en'");
    expect(fridayMigration).toContain("m.canonical_title");
    expect(fridayMigration).toContain("m.description");
    expect(fridayMigration).toContain("coalesce((m.readiness ->> 'ready')::boolean, false)");
  });

  it("materializes exactly one clean Friday Top-10 package atomically", () => {
    expect(fridayMigration).toContain("replace_cinema_catalog_week");
    expect(fridayMigration).toContain("jsonb_array_length(p_movies) <> 10");
    expect(fridayMigration).toContain("cinema_catalog_translations_incomplete");
    expect(fridayMigration).toContain("cinema_catalog_week_already_materialized");
    expect(fridayMigration).toContain("cinema_catalog_week_existing_nonbootstrap");
    expect(fridayMigration).toContain("delete from public.cinema_catalog_movies");
    expect(fridayMigration).toContain("insert into public.cinema_catalog_movies");
    expect(fridayMigration).toContain("insert into public.cinema_catalog_screenings");
    expect(fridayMigration).toContain("grant execute on function public.replace_cinema_catalog_week(text, date, date, jsonb) to service_role");
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
