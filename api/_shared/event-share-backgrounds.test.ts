import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  eventShareBackgroundUrls,
  resolveEventShareBackgroundUrl,
  serviceShareBackgroundUrls,
} from "./event-share-backgrounds";

describe("event share backgrounds", () => {
  it("maps all 40 category artwork codes to repository 4:3 WebP assets", () => {
    const entries = Object.entries(eventShareBackgroundUrls);
    expect(entries).toHaveLength(40);

    for (const [code, url] of entries) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(url.pathname).toMatch(/\/images\/activities\/share-4x3\/\d{2}-[a-z0-9-]+\.webp$/);
      expect(existsSync(url), url.pathname).toBe(true);
    }
  });

  it("resolves localized activities and keeps unknown custom events on fallback", () => {
    expect(resolveEventShareBackgroundUrl({ activity: "Волейбол" })?.pathname).toContain("01-volleyball.webp");
    expect(resolveEventShareBackgroundUrl({ activity: "Městská procházka" })?.pathname).toContain("31-city-walk.webp");
    expect(resolveEventShareBackgroundUrl({ activity: "Мой уникальный вечер" })).toBeNull();
  });

  it("uses the manicure service share artwork for localized Beauty services", () => {
    expect(existsSync(serviceShareBackgroundUrls.manicure)).toBe(true);
    expect(resolveEventShareBackgroundUrl({ activity: "Маникюр с гель-лаком" }))
      .toBe(serviceShareBackgroundUrls.manicure);
    expect(resolveEventShareBackgroundUrl({ activity: "Manikúra" }))
      .toBe(serviceShareBackgroundUrls.manicure);
  });
});
