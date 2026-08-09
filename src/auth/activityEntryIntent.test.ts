import { describe, expect, it } from "vitest";
import {
  buildCanonicalActivityEntryPath,
  resolveActivityEntryIntent,
  resolveActivityEntryIntentFromUrl,
} from "./activityEntryIntent";

const activityId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";

describe("external activity entry intent", () => {
  it("treats a canonical event landing as view-only", () => {
    expect(resolveActivityEntryIntent({ pathname: `/e/${activityId}` })).toEqual({
      activityId,
      action: "view",
      route: "event",
    });
  });

  it("restores join and request intents without executing either action", () => {
    expect(resolveActivityEntryIntent({ pathname: `/e/${activityId}`, hash: "#join" })?.action).toBe("join");
    expect(resolveActivityEntryIntent({
      pathname: `/e/${activityId}`,
      search: "?intent=request_to_join&source=instagram",
    })?.action).toBe("request_to_join");
    expect(resolveActivityEntryIntent({ pathname: `/join/${activityId}` })?.action).toBe("join");
  });

  it("normalizes legacy join routes without losing attribution or protected intent", () => {
    const intent = resolveActivityEntryIntent({ pathname: `/join/${activityId}` });
    expect(intent && buildCanonicalActivityEntryPath(intent, "?source=whatsapp&intent=view")).toBe(
      `/e/${activityId}?source=whatsapp#join`,
    );
  });

  it("fails closed for invalid IDs, actions, and cross-origin URLs", () => {
    expect(resolveActivityEntryIntent({ pathname: "/e/not-an-event", hash: "#join" })).toBeNull();
    expect(resolveActivityEntryIntent({ pathname: `/e/${activityId}`, hash: "#delete" })?.action).toBe("view");
    expect(resolveActivityEntryIntentFromUrl(`https://evil.example/e/${activityId}#join`, "https://go-irl.fun")).toBeNull();
  });
});
