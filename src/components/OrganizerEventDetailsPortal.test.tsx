import { describe, expect, it } from "vitest";
import { cezfestHierarchyDemo } from "../activityHierarchyDemo";
import { findHierarchyProgramForSheet, findSportActivityForSheet } from "./OrganizerEventDetailsPortal";

describe("OrganizerEventDetailsPortal hierarchy lookup", () => {
  it("matches the generic festival sheet after displayed emoji stripping", () => {
    const root = cezfestHierarchyDemo.find((activity) => activity.id === "demo-cezfest-2026")!;

    expect(findSportActivityForSheet(
      cezfestHierarchyDemo,
      "en",
      "ČEZFEST 2026",
      "Festival with separate sport and culture programs.",
    )?.id).toBe(root.id);
  });

  it("builds a festival program only for a hierarchy root sheet", () => {
    const rootProgram = findHierarchyProgramForSheet(
      cezfestHierarchyDemo,
      "en",
      "ČEZFEST 2026",
      "Festival with separate sport and culture programs.",
    );
    const categoryProgram = findHierarchyProgramForSheet(
      cezfestHierarchyDemo,
      "en",
      "ČEZFEST — Sport",
      "Festival sport program.",
    );

    expect(rootProgram?.root.id).toBe("demo-cezfest-2026");
    expect(rootProgram?.eventCount).toBe(5);
    expect(categoryProgram).toBeNull();
  });
});
