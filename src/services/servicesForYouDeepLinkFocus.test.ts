import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Services deep link For You focus", () => {
  it("routes the deep link to For You and focuses the exact existing professional card without opening it", () => {
    const source = readFileSync(new URL("./ServicesClientViews.tsx", import.meta.url), "utf8");

    expect(source).toContain('if (targetSlug) useAppStore.getState().setView("discover")');
    expect(source).toContain("professional.slug === targetSlug");
    expect(source).toContain("professional.profileId === focusedProfessional.profileId");
    expect(source).toContain("element.dataset.beautySlug === targetSlug");
    expect(source).toContain('querySelector<HTMLElement>("article.services-professional-card")');
    expect(source).toContain('scrollIntoView({ block: "center", inline: "center" })');
    expect(source).toContain("clearBeautyDeepLink(window.location.pathname, window.location.search, window.location.hash)");
    expect(source).not.toContain("opener.click()");
  });
});
