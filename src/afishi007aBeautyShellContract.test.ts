import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/city-posters/city-posters.css"), "utf8");
const eventRepository = readFileSync(resolve(process.cwd(), "src/city-posters/events/cityPostersEventRepository.ts"), "utf8");
const cinemaRepository = readFileSync(resolve(process.cwd(), "src/city-posters/cinema/cinemaRepository.ts"), "utf8");

describe("AFISHI007A Beauty shell isolation", () => {
  it("keeps the four City Posters entries on the Services/Beauty visual shell", () => {
    expect(page).toContain('const homeCategories: CityPostersCategory[] = ["cinema", "concerts", "festivals", "sport"]');
    expect(page).toContain('className="category-grid module-grid services-category-grid city-posters-category-grid"');
    expect(page).toContain('className="category-button city-posters-category-card"');
    expect(page).toContain('<nav className="bottom-nav"');
    expect(page).not.toContain("city-posters-category-tabs");
    expect(page).not.toContain("city-posters-bottom-nav");
  });

  it("renders placeholders only and performs zero production event reads", () => {
    expect(page).not.toContain("CinemaPostersCatalog");
    expect(page).not.toContain("CityPostersEventCatalog");
    expect(page).not.toContain("city_posters_event_catalog");
    expect(page).not.toContain("city_posters_cinema_catalog");
    expect(page).toContain("emptyCatalog");
    expect(eventRepository).toContain('supabase.rpc("city_posters_event_catalog"');
    expect(cinemaRepository).toContain('supabase.rpc("city_posters_cinema_catalog"');
  });

  it("does not import Beauty booking/professional behavior or event-card presentation", () => {
    expect(page).not.toContain("ServicesProfessional");
    expect(page).not.toContain("BeautyMasterWorkspace");
    expect(page).not.toContain("submitServiceBooking");
    expect(styles).not.toContain(".city-posters-event-card");
    expect(styles).not.toContain(".city-posters-event-list");
  });
});
