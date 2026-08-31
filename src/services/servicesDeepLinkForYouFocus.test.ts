import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Services Beauty deep link For You focus", () => {
  it("routes Beauty deep links to For You and focuses the exact existing professional card without auto-opening profile details", () => {
    const headerSource = readFileSync(new URL("../components/AppHeader.tsx", import.meta.url), "utf8");
    const viewsSource = readFileSync(new URL("./ServicesClientViews.tsx", import.meta.url), "utf8");

    const deepLinkRouteStart = headerSource.indexOf("const slug = beautyDeepLinkSlug");
    const deepLinkRouteEnd = headerSource.indexOf("useEffect(() => {", deepLinkRouteStart + 1);
    const deepLinkRoute = headerSource.slice(deepLinkRouteStart, deepLinkRouteEnd);
    expect(deepLinkRoute).toContain('setView("discover")');
    expect(deepLinkRoute).not.toContain('setView("explore")');

    const forYouStart = viewsSource.indexOf("export function ServicesForYouView");
    const catalogStart = viewsSource.indexOf("export function ServicesCatalogView", forYouStart);
    const forYouSource = viewsSource.slice(forYouStart, catalogStart);
    const catalogSource = viewsSource.slice(catalogStart);

    expect(forYouSource).toContain("pendingBeautyDeepLinkFocusSlug(pathname, search)");
    expect(forYouSource).toContain("professional.slug === targetSlug");
    expect(forYouSource).toContain("professional.profileId === focusedProfessional.profileId");
    expect(forYouSource).toContain("useAppStore.getState().setSelectedCity(match.cityId)");
    expect(forYouSource).toContain("element.dataset.beautySlug === targetSlug");
    expect(forYouSource).toContain('querySelector<HTMLElement>("article.unified-event-card")');
    expect(forYouSource).toContain('scrollIntoView({ block: "center", inline: "center" })');
    expect(forYouSource).toContain("markBeautyDeepLinkFocusHandled");
    expect(forYouSource).not.toContain(".click()");

    expect(catalogSource).not.toContain("beautyDeepLinkSlug(window.location.pathname");
    expect(catalogSource).not.toContain("opener.click()");
  });
});
