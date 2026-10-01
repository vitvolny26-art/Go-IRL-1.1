import { describe, expect, it } from "vitest";
import { isActivitiesDomainPath, isOffersDomainPath, isServicesDomainPath, shouldShowInternalHeader } from "./appDomainRoutes";

describe("app domain routes", () => {
  it("treats activity catalog and canonical event entries as the activities domain", () => {
    const activityId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";

    expect(isActivitiesDomainPath("/activities")).toBe(true);
    expect(isActivitiesDomainPath("/activities/")).toBe(true);
    expect(isActivitiesDomainPath(`/e/${activityId}`)).toBe(true);
    expect(isActivitiesDomainPath(`/e/${activityId}/ru`)).toBe(true);
    expect(isActivitiesDomainPath(`/join/${activityId}`)).toBe(true);
    expect(isActivitiesDomainPath(`/join/${activityId}/cs`)).toBe(true);
  });

  it("keeps non-activity app paths out of the activities domain", () => {
    expect(isActivitiesDomainPath("/")).toBe(false);
    expect(isActivitiesDomainPath("/profile/activities")).toBe(false);
    expect(isActivitiesDomainPath("/services")).toBe(false);
  });

  it("preserves services and offers domain detection", () => {
    expect(isServicesDomainPath("/services")).toBe(true);
    expect(isServicesDomainPath("/beauty/test-studio")).toBe(true);
    expect(isServicesDomainPath("/beauty/test-studio/en")).toBe(true);
    expect(isOffersDomainPath("/offers/")).toBe(true);
  });

  it("shows the internal header on domain homes and canonical activity entries", () => {
    expect(shouldShowInternalHeader({ pathname: "/", selected: false, view: "home" })).toBe(false);
    expect(shouldShowInternalHeader({ pathname: "/activities", selected: false, view: "home" })).toBe(true);
    expect(shouldShowInternalHeader({ pathname: "/join/event-1", selected: false, view: "home" })).toBe(true);
    expect(shouldShowInternalHeader({ pathname: "/", selected: true, view: "home" })).toBe(true);
    expect(shouldShowInternalHeader({ pathname: "/", selected: false, view: "discover" })).toBe(true);
  });
});
