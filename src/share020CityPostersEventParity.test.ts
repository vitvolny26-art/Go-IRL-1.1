import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const catalog = readFileSync(resolve(process.cwd(), "src/city-posters/events/CityPostersEventCatalog.tsx"), "utf8");

describe("SHARE020 City Posters event parity", () => {
  it("keeps live event groups available in For You as well as Catalog", () => {
    expect(page).toContain('category === "festivals" || category === "concerts" || category === "culture" || category === "events"');
    expect(page).toContain('variant="for-you"');
  });

  it("applies the unified event card contract by exclusion instead of a per-feature whitelist", () => {
    expect(catalog).toContain('const featuredCategory = category !== "cinema" && category !== "sport" && category !== "all";');
  });

  it("keeps exact-event details and prepared Telegram sharing on unified event cards", () => {
    expect(catalog).toContain('const detailsHref = `/city-posters?event=${encodeURIComponent(row.canonical_slug)}`;');
    expect(catalog).toContain('onTelegramShare={() => sharePreparedTelegramCityPostersEvent(row.canonical_slug, language)}');
    expect(catalog).toContain('onClick={() => { window.location.href = detailsHref; }}');
  });
});
