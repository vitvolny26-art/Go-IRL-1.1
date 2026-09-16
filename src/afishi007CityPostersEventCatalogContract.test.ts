import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260916130000_afishi007_city_posters_event_catalog.sql"),
  "utf8",
);
const repository = readFileSync(
  resolve(process.cwd(), "src/city-posters/events/cityPostersEventRepository.ts"),
  "utf8",
);
const catalog = readFileSync(
  resolve(process.cwd(), "src/city-posters/events/CityPostersEventCatalog.tsx"),
  "utf8",
);
const page = readFileSync(
  resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"),
  "utf8",
);
const styles = readFileSync(
  resolve(process.cwd(), "src/city-posters/city-posters.css"),
  "utf8",
);

describe("AFISHI007 canonical City Posters event catalog", () => {
  it("uses a narrow security-definer RPC while leaving base tables closed to anon", () => {
    expect(migration).toContain("create or replace function public.city_posters_event_catalog(");
    expect(migration).toContain("security definer");
    expect(migration).toContain("event.status = 'published'");
    expect(migration).toContain("grant execute on function public.city_posters_event_catalog");
    expect(migration).toContain("to anon, authenticated, service_role");
    expect(migration).not.toContain("grant select on table public.city_posters_");
  });

  it("reads canonical events only through the RPC", () => {
    expect(repository).toContain('supabase.rpc("city_posters_event_catalog"');
    expect(repository).not.toContain('.from("city_posters_');
  });

  it("wires the canonical catalog into all four City Posters categories", () => {
    expect(page).toContain('import { CityPostersEventCatalog } from "./events/CityPostersEventCatalog"');
    expect(page).toContain("<CityPostersEventCatalog");
    expect(page).toContain('category={category}');
    expect(page).toContain('timeFilter={timeFilter}');
    expect(page).toContain('query={query}');
    expect(catalog).toContain('queryKey: ["city-posters-events"');
  });

  it("reuses the Services bottom-nav contract and has no category-local tab strip", () => {
    expect(page).toContain('<nav className="bottom-nav"');
    expect(page).not.toContain("city-posters-category-tabs");
    expect(page).not.toContain("city-posters-bottom-nav");
    expect(styles).not.toContain(".city-posters-category-tabs");
    expect(styles).not.toContain(".city-posters-bottom-nav");
    expect(catalog).not.toContain('city-posters-event-card.css');
  });
});
