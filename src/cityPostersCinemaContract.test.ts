import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const page = source("./city-posters/CityPostersPage.tsx");
const catalog = source("./city-posters/cinema/CinemaPostersCatalog.tsx");
const repository = source("./city-posters/cinema/cinemaRepository.ts");
const migration = readFileSync(new URL("../supabase/migrations/20260914130000_city_posters_cinema_public_catalog.sql", import.meta.url), "utf8");

describe("City Posters cinema ownership", () => {
  it("keeps the Cinema backend/repository available while AFISHI007A leaves the visible shell disconnected", () => {
    expect(page).not.toContain('from "./cinema/CinemaPostersCatalog"');
    expect(page).not.toContain("<CinemaPostersCatalog");
    expect(page).toContain('const homeCategories: CityPostersCategory[] = ["cinema", "concerts", "festivals", "sport"]');
    expect(page).toContain('className="category-grid module-grid services-category-grid city-posters-category-grid"');
    expect(catalog).toContain("groupCinemaPosterMovies");
    expect(repository).toContain('supabase.rpc("city_posters_cinema_catalog"');
    expect(index).not.toContain('/src/cinema/cinema-entry.ts');
  });

  it("keeps the public guest read path narrow without adding a Vercel function or opening base tables", () => {
    expect(repository).toContain('supabase.rpc("city_posters_cinema_catalog"');
    expect(repository).not.toContain('.from("cinema_');
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("grant execute on function public.city_posters_cinema_catalog(text, integer) to anon, authenticated, service_role");
    expect(migration).not.toContain("grant select on public.cinema_movies to anon");
    expect(migration).not.toContain("grant select on public.cinema_screenings to anon");
    expect(migration).not.toContain("source_id text");
    expect(migration).toContain("sr.status = 'success'");
    expect(migration).toContain("sr.is_complete = true");
  });
});
