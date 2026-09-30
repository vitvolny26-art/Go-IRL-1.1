import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const catalog = readFileSync(resolve(process.cwd(), "src/city-posters/events/CityPostersEventCatalog.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/city-posters/city-posters.css"), "utf8");

describe("AFISHI015 Festivals UX parity", () => {
  it("uses rectangular canonical event cards on Festivals For you", () => {
    expect(page).toContain('category === "festivals"');
    expect(page).toContain('category="festivals"');
    expect(page).toContain('variant="for-you"');
    expect(styles).toContain(".city-posters-event-list--for-you .city-posters-event-card");
    expect(styles).toContain("grid-template-columns:minmax(120px,38%) 1fr");
  });

  it("uses square badge cards in the canonical catalog", () => {
    expect(page).toContain('variant="catalog"');
    expect(catalog).toContain('variant?: "catalog" | "for-you"');
    expect(catalog).toContain("city-posters-event-badges");
    expect(styles).toContain(".city-posters-event-list--catalog .city-posters-event-card");
    expect(styles).toContain("aspect-ratio:1");
  });

  it("keeps details and planning on the City Posters event flow", () => {
    expect(catalog).toContain('const detailsHref = `/city-posters?event=${encodeURIComponent(row.canonical_slug)}`');
    expect(catalog).toContain("planCityPostersEventBySlug");
    expect(catalog).toContain('eventSlug ? "detail" : variant');
  });
});
