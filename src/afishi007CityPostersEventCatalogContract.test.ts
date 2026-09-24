import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const repository = readFileSync(resolve(process.cwd(), "src/city-posters/events/cityPostersEventRepository.ts"), "utf8");
const catalog = readFileSync(resolve(process.cwd(), "src/city-posters/events/CityPostersEventCatalog.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/city-posters/city-posters.css"), "utf8");
const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260924103000_afishi007_city_posters_visibility_pipeline.sql"), "utf8");
const launch = readFileSync(resolve(process.cwd(), "src/launchSurface.ts"), "utf8");

describe("AFISHI007 City Posters visibility pipeline", () => {
  it("connects the generic canonical catalog without adding a fifth Home category card", () => {
    expect(page).toContain("CityPostersEventCatalog");
    expect(page).toContain('category="all"');
    expect(page).toContain('timeFilter="tomorrow"');
    expect(page).toContain('const homeCategories: CityPostersCategory[] = ["cinema", "concerts", "festivals", "sport"]');
    expect(repository).toContain('"family"');
    expect(repository).toContain('category === "all" ? catalogVerticals');
  });

  it("renders canonical event cards and preserves all-day dates without midnight time", () => {
    expect(catalog).toContain("inferredAllDay");
    expect(catalog).toContain("inclusiveEnd");
    expect(catalog).toContain("city-posters-event-card");
    expect(catalog).toContain("planCityPostersEventBySlug");
    expect(styles).toContain(".city-posters-event-card");
    expect(styles).toContain(".city-posters-event-actions");
  });

  it("adds an exact read-only published-event lookup for deep links", () => {
    expect(migration).toContain("create or replace function public.city_posters_event_by_slug");
    expect(migration).toContain("event.status = 'published'");
    expect(migration).toContain("(select count(*) from matching_events) = 1");
    expect(migration).toContain("coalesce(candidate.ends_at, candidate.starts_at + interval '3 hours') >= now()");
    expect(migration).toContain("to anon, authenticated, service_role");
    expect(repository).toContain('supabase.rpc("city_posters_event_by_slug"');
  });

  it("routes Telegram promotion deep links into the exact Offers surface in the Mini App", () => {
    expect(launch).toContain('new URL("/offers", window.location.origin)');
    expect(launch).not.toContain('useAppStore.setState({ selectedCityId: "olomouc", view: "discover" })');
    expect(page).toContain("focusedEventSlug");
    expect(page).toContain("eventSlug={focusedEventSlug}");
  });
});
