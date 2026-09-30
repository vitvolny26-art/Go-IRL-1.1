import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/city-posters/CityPostersPage.tsx"), "utf8");
const catalog = readFileSync(resolve(process.cwd(), "src/city-posters/events/CityPostersEventCatalog.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/city-posters/city-posters.css"), "utf8");
const lateStyles = readFileSync(resolve(process.cwd(), "src/afishi015-festival-meta-overrides.css"), "utf8");
const mainEntry = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");

describe("AFISHI015 Festivals UX parity", () => {
  it("removes the generic event feed from City Posters home", () => {
    const homeSection = page.slice(page.indexOf("city-posters-home"), page.indexOf("const navItems"));
    expect(homeSection).toContain("{renderCategoryCards()}");
    expect(homeSection).not.toContain('category="all"');
  });

  it("reuses Activity For You and Catalog container patterns for Festivals", () => {
    expect(catalog).toContain('"horizontal-events city-posters-event-list city-posters-event-list--for-you"');
    expect(catalog).toContain(': "activity-stack"');
    expect(catalog).not.toContain('"activity-stack city-posters-event-list city-posters-event-list--catalog"');
    expect(styles).toContain("flex:0 0 min(92vw,420px)");
    expect(styles).toContain("-webkit-line-clamp:3!important");
    expect(styles).toContain("grid-template-columns:repeat(2,minmax(0,1fr))!important");
    expect(styles).toContain(".compact-sport-card.unified-event-card.city-posters-festival-activity-card .city-posters-festival-meta{");
    expect(styles).toContain("position:absolute!important");
    expect(styles).toContain("bottom:20px!important");
    expect(styles).toContain(".horizontal-events .compact-sport-card.unified-event-card.city-posters-festival-activity-card .city-posters-festival-meta{");
    expect(styles).toContain("bottom:112px!important");
    expect(styles).toContain("grid-column:1/-1!important");
    expect(styles).toContain("white-space:nowrap!important");
    expect(styles).toContain("left:20px!important");
    expect(styles).toContain("right:20px!important");
    expect(styles).toContain("border-left:1px solid rgba(255,255,255,.18)!important");
    expect(styles).not.toContain(".activity-stack .city-posters-festival-activity-card .activity-card-details.city-posters-festival-meta");
    expect(styles).not.toContain(".activity-card-details.sport-details-grid.city-posters-festival-meta");
    expect(catalog).toContain("const cityLabel = getCity(rowCityId).name.cs");
    expect(catalog).toContain("const descriptionLocationMatch = row.description.match(/📍");
    expect(catalog).toContain("function inferFestivalVenueLabel(row: CityPostersEventRow)");
    expect(catalog).toContain('if (row.city_id === "olomouc" && haystack.includes("vinn")) return "Dolní náměstí";');
    expect(catalog).toContain("const venueLocationLabel = row.venue_address || row.venue_name || descriptionVenueLabel || inferredVenueLabel");
    expect(catalog).toContain("const cityDisplayLabel = getCity(rowCityId).name[language]");
    expect(catalog).toContain("value={cityDisplayLabel}");
    expect(catalog).toContain("{venueLocationLabel ? <EventCardMetaItem icon={null} caption=\"\" value={venueLocationLabel} /> : null}");
    expect(catalog).toContain("onClick={() => openCityPostersCalendar(row, detailsHref, locationLabel)}");
    expect(catalog).toContain("onClick={() => openCityPostersMap(locationLabel, cityLabel)}");
    expect(styles).toContain("text-align:center!important");
  });

  it("loads the Festival metadata override after the global card CSS stack", () => {
    expect(mainEntry.indexOf('import "./responsive-shell.css";')).toBeGreaterThan(-1);
    expect(mainEntry.indexOf('import "./afishi015-festival-meta-overrides.css";'))
      .toBeGreaterThan(mainEntry.indexOf('import "./responsive-shell.css";'));
    expect(lateStyles).toContain(".compact-sport-card.unified-event-card.glass-event-card.city-posters-festival-activity-card>.city-posters-festival-meta{");
    expect(lateStyles).toContain("top:auto!important");
    expect(lateStyles).toContain("bottom:18px!important");
    expect(lateStyles).toContain(".horizontal-events .compact-sport-card.unified-event-card.glass-event-card.city-posters-festival-activity-card>.city-posters-festival-meta{");
    expect(lateStyles).toContain("bottom:112px!important");
    expect(lateStyles).toContain("min-height:36px!important");
    expect(lateStyles).toContain("flex-direction:row!important");
    expect(lateStyles).toContain("order:initial!important");
    expect(lateStyles).toContain("grid-row:1!important");
    expect(lateStyles).toContain("grid-row:2!important");
    expect(lateStyles).toContain("grid-row:3!important");
    expect(lateStyles).toContain("border-top:1px solid rgba(255,255,255,.16)!important");
    expect(lateStyles).toContain("border-left:1px solid rgba(255,255,255,.18)!important");
    expect(lateStyles).toContain("border-left:0!important");
  });

  it("renders Festivals with the Activity card shell in both tabs", () => {
    expect(catalog).toContain('className="activity-card sport-card compact-sport-card unified-event-card glass-event-card city-posters-festival-activity-card"');
    expect(catalog).toContain('className="glass-event-card-artwork"');
    expect(catalog).toContain('className="city-posters-festival-meta"');
    expect(catalog).toContain("<CardShareAction");
    expect(catalog).not.toContain("organizer-avatar-thumb");
    expect(catalog).toContain('className="activity-card-footer compact-sport-actions"');
    expect(catalog).toContain("row.hero_media_url || \"/city-posters/category-backgrounds/festivals.webp\"");
  });

  it("keeps details and planning on the City Posters event flow", () => {
    expect(catalog).toContain('const detailsHref = `/city-posters?event=${encodeURIComponent(row.canonical_slug)}`');
    expect(catalog).toContain("planCityPostersEventBySlug");
    expect(catalog).toContain('eventSlug ? "detail" : variant');
  });
});
