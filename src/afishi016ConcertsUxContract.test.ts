import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalog = fs.readFileSync(path.join(root, "src/city-posters/events/CityPostersEventCatalog.tsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "src/city-posters/city-posters.css"), "utf8");
const page = fs.readFileSync(path.join(root, "src/city-posters/CityPostersPage.tsx"), "utf8");

describe("AFISHI016 Concerts UX parity", () => {
  it("uses the Festival Activity-style card contract for Concerts in For You and Catalog", () => {
    expect(catalog).toContain('category === "festivals" || category === "concerts"');
    expect(catalog).toContain('const isConcert = category === "concerts"');
    expect(catalog).toContain('city-posters-concert-activity-card');
    expect(catalog).toContain('"concerts" : "festivals"');
    expect(catalog).toContain('<CardShareAction');
    expect(catalog).toContain('onTelegramShare={() => sharePreparedTelegramCityPostersEvent(row.canonical_slug, language)}');
    expect(catalog).toContain('language === "ru" ? "Концерт" : "Concert"');
  });

  it("keeps Catalog root category-only and Concert cards on the shared square contract", () => {
    expect(page).toContain('{renderCategoryCards()}</section>');
    expect(page).not.toContain('category="all"');
    expect(catalog).toContain('cardVariant === "for-you"');
  });

  it("keeps detail artwork and close fixed while only copy scrolls", () => {
    expect(catalog).toContain('row.vertical === "concerts" ? "concerts" : "festivals"');
    expect(styles).toContain(".city-posters-event-detail-artwork{position:absolute");
    expect(styles).toContain(".city-posters-event-detail-close{position:absolute");
    expect(styles).toContain(".city-posters-event-detail-scroll{position:absolute");
    expect(styles).toContain("overflow-y:auto");
    expect(styles).toContain(".city-posters-event-detail-actions{position:absolute");
  });
});
