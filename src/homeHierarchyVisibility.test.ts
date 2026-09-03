import { describe, expect, it } from "vitest";
import { cezfestHierarchyDemo } from "./activityHierarchyDemo";
import { getHomeHiddenHierarchyActivityIds } from "./homeHierarchyVisibility";

describe("home hierarchy visibility", () => {
  it("keeps the festival root visible and hides category/event descendants", () => {
    const hidden = getHomeHiddenHierarchyActivityIds(cezfestHierarchyDemo);

    expect(hidden.has("demo-cezfest-2026")).toBe(false);
    expect(hidden.has("demo-cezfest-sport")).toBe(true);
    expect(hidden.has("demo-cezfest-culture")).toBe(true);
    expect(hidden.has("demo-cezfest-running")).toBe(true);
  });
});
