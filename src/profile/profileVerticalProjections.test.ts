import { describe, expect, it } from "vitest";
import type { Activity } from "../types";
import type { MyGoIrlProjection } from "./myGoIrlProjection";
import { buildProfileVerticalProjectionSummary } from "./profileVerticalProjections";

const activity = (id: string) => ({ id }) as Activity;

const activityProjection: MyGoIrlProjection = {
  upcomingCreated: [activity("created-1"), activity("created-2")],
  upcomingJoined: [activity("joined-1")],
  pendingRequests: [activity("pending-1")],
  past: [activity("past-1"), activity("past-2"), activity("past-3")],
};

describe("profile vertical projection summary", () => {
  it("exposes only activity lifecycle counts to the Activities projection", () => {
    const summary = buildProfileVerticalProjectionSummary(activityProjection, {
      services: ["hair", "massage"],
    });

    expect(summary.activities).toEqual({
      upcomingCreatedCount: 2,
      upcomingJoinedCount: 1,
      pendingRequestsCount: 1,
      pastCount: 3,
    });
    expect(summary.activities).not.toHaveProperty("preferenceIds");
  });

  it("exposes only stable service preference IDs to the Services projection", () => {
    const summary = buildProfileVerticalProjectionSummary(activityProjection, {
      services: ["hair", "massage"],
    });

    expect(summary.services).toEqual({ preferenceIds: ["hair", "massage"] });
    expect(summary.services).not.toHaveProperty("upcomingCreated");
    expect(summary.services).not.toHaveProperty("pendingRequests");
  });

  it("copies canonical service IDs instead of sharing mutable preference state", () => {
    const preferences = { services: ["facial"] as const };
    const summary = buildProfileVerticalProjectionSummary(activityProjection, {
      services: [...preferences.services],
    });

    summary.services.preferenceIds.push("manicure");
    expect(preferences.services).toEqual(["facial"]);
  });
});
