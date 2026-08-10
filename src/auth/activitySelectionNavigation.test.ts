import { describe, expect, it } from "vitest";
import {
  buildActivitySelectionReturnPath,
  buildGuestActivitySelectionPath,
  resolveStoredActivitySelectionReturnPath,
  shouldCanonicalizeGuestActivitySelection,
} from "./activitySelectionNavigation";

const activityId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";

describe("activity selection navigation", () => {
  it("promotes a guest selection from /activities to canonical view-only event entry", () => {
    const location = { pathname: "/activities", search: "?source=instagram" };
    expect(shouldCanonicalizeGuestActivitySelection(location, activityId)).toBe(true);
    expect(buildActivitySelectionReturnPath(location)).toBe("/activities?source=instagram");
    expect(buildGuestActivitySelectionPath(activityId, location.search)).toBe(
      `/e/${activityId}?source=instagram`,
    );
  });

  it("does not change canonical entries or service routes", () => {
    expect(shouldCanonicalizeGuestActivitySelection({ pathname: `/e/${activityId}` }, activityId)).toBe(false);
    expect(shouldCanonicalizeGuestActivitySelection({ pathname: "/services" }, activityId)).toBe(false);
  });

  it("fails closed when restoring an untrusted return path", () => {
    expect(resolveStoredActivitySelectionReturnPath("https://evil.example/activities")).toBe("/activities");
    expect(resolveStoredActivitySelectionReturnPath("//evil.example/activities")).toBe("/activities");
    expect(resolveStoredActivitySelectionReturnPath("/activities?source=instagram#catalog")).toBe(
      "/activities?source=instagram#catalog",
    );
  });
});