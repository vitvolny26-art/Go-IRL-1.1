import { describe, expect, it } from "vitest";
import {
  guestActivityCatalogCityIds,
  guestProtectedActionSelector,
  isPublicGuestAppRoute,
  isPublicGuestServicesRoute,
} from "./guestAppAccess";

const activityId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";

describe("public guest app access", () => {
  it("loads every configured city only for an exact shared event entry", () => {
    expect(guestActivityCatalogCityIds(`/e/${activityId}`, "prague", ["olomouc", "prague"]))
      .toEqual(["prague", "olomouc"]);
    expect(guestActivityCatalogCityIds("/activities", "prague", ["olomouc", "prague"]))
      .toEqual(["prague"]);
  });

  it("allows shared Beauty service details as a public app route", () => {
    expect(isPublicGuestServicesRoute("/services")).toBe(true);
    expect(isPublicGuestServicesRoute("/beauty/beauty-test/cs")).toBe(true);
    expect(isPublicGuestAppRoute("/beauty/beauty-test/cs")).toBe(true);
    expect(isPublicGuestServicesRoute("/beauty/beauty-test/de")).toBe(false);
  });

  it("allows public event and service details while keeping mutations protected", () => {
    expect(isPublicGuestAppRoute(`/join/${activityId}`)).toBe(true);
    expect(guestProtectedActionSelector).toContain(".card-join");
    expect(guestProtectedActionSelector).toContain(".main-action");
    expect(guestProtectedActionSelector).toContain(".activity-chat-toggle");
    expect(guestProtectedActionSelector).not.toContain(".sport-card-main");
    expect(guestProtectedActionSelector).not.toContain(".event-details-action");
    expect(guestProtectedActionSelector).not.toContain(".services-professional-main");
    expect(guestProtectedActionSelector).toContain(".services-professional-actions .primary");
  });
});
