import { describe, expect, it } from "vitest";
import { cezfestHierarchyDemo } from "./activityHierarchyDemo";
import {
  getHierarchyChildren,
  getHierarchyParent,
  getHierarchyPath,
  getHierarchyProgram,
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

  it("builds a festival program from category sections and concrete events", () => {
    const program = getHierarchyProgram(cezfestHierarchyDemo, root.id);

    expect(program?.root.id).toBe(root.id);
    expect(program?.sections.map((section) => section.category.id)).toEqual([
      "demo-cezfest-sport",
      "demo-cezfest-culture",
    ]);
    expect(program?.sections[0]?.events.map((activity) => activity.id)).toEqual([
      "demo-cezfest-running",
      "demo-cezfest-floorball-u15",
      "demo-cezfest-parkour",
      "demo-cezfest-floorball-15plus",
      "demo-cezfest-sports-talk",
    ]);
    expect(program?.sections[1]?.events).toEqual([]);
    expect(program?.ungroupedEvents).toEqual([]);
    expect(program?.eventCount).toBe(5);
  });

  it("ignores malformed cross-root children when building a festival program", () => {
    const malformed = {
      ...running,
      id: "demo-cross-root-event",
      metadata: {
        ...running.metadata,
        hierarchy: {
          level: "event" as const,
          parentActivityId: "demo-cezfest-sport",
          rootActivityId: "other-festival",
          groupCategory: "sport",
        },
      },
    };
    const program = getHierarchyProgram([...cezfestHierarchyDemo, malformed], root.id);

    expect(program?.sections[0]?.events.some((activity) => activity.id === malformed.id)).toBe(false);
    expect(program?.eventCount).toBe(5);
    expect(getHierarchyProgram(cezfestHierarchyDemo, "missing-root")).toBeNull();
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
