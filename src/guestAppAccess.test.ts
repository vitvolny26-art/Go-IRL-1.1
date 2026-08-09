import { describe, expect, it } from "vitest";
import {
  guestActivityCatalogCityIds,
  guestProtectedActionSelector,
  isPublicGuestAppRoute,
} from "./guestAppAccess";

const activityId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";

describe("public guest app access", () => {
  it("loads every configured city only for an exact shared event entry", () => {
    expect(guestActivityCatalogCityIds(`/e/${activityId}`, "prague", ["olomouc", "prague"]))
      .toEqual(["prague", "olomouc"]);
    expect(guestActivityCatalogCityIds("/activities", "prague", ["olomouc", "prague"]))
      .toEqual(["prague"]);
  });

  it("allows public event details while keeping participation and identity protected", () => {
    expect(isPublicGuestAppRoute(`/join/${activityId}`)).toBe(true);
    expect(guestProtectedActionSelector).toContain(".card-join");
    expect(guestProtectedActionSelector).toContain(".main-action");
    expect(guestProtectedActionSelector).toContain(".activity-chat-toggle");
    expect(guestProtectedActionSelector).not.toContain(".sport-card-main");
    expect(guestProtectedActionSelector).not.toContain(".event-details-action");
  });
});
