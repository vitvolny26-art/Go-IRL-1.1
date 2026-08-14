import { describe, expect, it } from "vitest";
import { activityShareCardAlias, isActivitySharePublicAlias } from "../../../api/_shared/activity-share-card-storage.js";
import vercel from "../../../vercel.json";

describe("Activity short share alias", () => {
  it("uses the compact Activity/date/collision contract", () => {
    const card = { activity: "Волейбол", eventDate: "2026-08-16", eventId: "ac72a1b4-814e-48ff-88b6-ff82d2751e63" } as never;
    expect(activityShareCardAlias(card)).toBe("Vol260816_a");
    expect(activityShareCardAlias(card, 1)).toBe("Vol260816_b");
    expect(activityShareCardAlias(card, 26)).toBe("Vol260816_aa");
    expect(isActivitySharePublicAlias("Vol260816_a")).toBe(true);
    expect(isActivitySharePublicAlias("volei-bol_ac72a1b4")).toBe(false);
  });

  it("routes root compact aliases through the existing event preview function", () => {
    expect(vercel.rewrites).toContainEqual({
      source: "/:alias([A-Za-z]{3}[0-9]{6}_[a-z]{1,2})",
      destination: "/api/meta/event-preview?alias=:alias",
    });
  });
});
