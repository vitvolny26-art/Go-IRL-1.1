import { describe, expect, it } from "vitest";
import { cezfestHierarchyDemo } from "./activityHierarchyDemo";
import {
  getHierarchyChildren,
  getHierarchyParent,
  getHierarchyPath,
  getHierarchyRoot,
  getTopLevelActivities,
  isHierarchyCategory,
  isHierarchyContainer,
  isHierarchyEvent,
  isHierarchyRoot,
} from "./activityHierarchy";
import { resolveActivityExperience } from "./verticals/registry";

describe("activity hierarchy v1", () => {
  const root = cezfestHierarchyDemo.find((activity) => activity.id === "demo-cezfest-2026")!;
  const sport = cezfestHierarchyDemo.find((activity) => activity.id === "demo-cezfest-sport")!;
  const running = cezfestHierarchyDemo.find((activity) => activity.id === "demo-cezfest-running")!;

  it("models root, category and event levels in metadata.hierarchy", () => {
    expect(isHierarchyRoot(root)).toBe(true);
    expect(isHierarchyCategory(sport)).toBe(true);
    expect(isHierarchyEvent(running)).toBe(true);
    expect(isHierarchyContainer(root)).toBe(true);
    expect(isHierarchyContainer(sport)).toBe(true);
  });

  it("resolves parent, root, children and path without schema changes", () => {
    expect(getHierarchyParent(cezfestHierarchyDemo, running)?.id).toBe("demo-cezfest-sport");
    expect(getHierarchyRoot(cezfestHierarchyDemo, running)?.id).toBe("demo-cezfest-2026");
    expect(getHierarchyChildren(cezfestHierarchyDemo, "demo-cezfest-sport")).toHaveLength(5);
    expect(getHierarchyPath(cezfestHierarchyDemo, running).map((activity) => activity.id)).toEqual([
      "demo-cezfest-2026",
      "demo-cezfest-sport",
      "demo-cezfest-running",
    ]);
    expect(getTopLevelActivities(cezfestHierarchyDemo).map((activity) => activity.id)).toEqual(["demo-cezfest-2026"]);
  });

  it("keeps hierarchy containers generic and concrete sport events on Sport renderer", () => {
    expect(resolveActivityExperience(root).type).toBe("generic");
    expect(resolveActivityExperience(sport).type).toBe("generic");
    expect(resolveActivityExperience(running).type).toBe("sport");
  });

  it("ships the agreed CEZFEST sport children", () => {
    expect(getHierarchyChildren(cezfestHierarchyDemo, "demo-cezfest-sport").map((activity) => activity.metadata?.sport?.sportType)).toEqual([
      "Running",
      "Floorball",
      "Parkour",
      "Floorball",
      "Sports Talk",
    ]);
  });
});
