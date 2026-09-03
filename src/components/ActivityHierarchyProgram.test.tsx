import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getHierarchyProgram } from "../activityHierarchy";
import { cezfestHierarchyDemo } from "../activityHierarchyDemo";
import { ActivityHierarchyProgram } from "./ActivityHierarchyProgram";

describe("ActivityHierarchyProgram", () => {
  it("renders festival sections and concrete events from hierarchy metadata", () => {
    const program = getHierarchyProgram(cezfestHierarchyDemo, "demo-cezfest-2026");
    expect(program).not.toBeNull();

    const html = renderToStaticMarkup(
      <ActivityHierarchyProgram program={program!} language="en" onOpen={() => undefined} />,
    );

    expect(html).toContain("Festival program");
    expect(html).toContain("5 events");
    expect(html).toContain("Sport");
    expect(html).toContain("Culture");
    expect(html).toContain("Running");
    expect(html).toContain("Floorball U15");
    expect(html).toContain("Events will be added later");
    expect(html).toContain('data-activity-id="demo-cezfest-running"');
  });

  it("keeps the component language-localized", () => {
    const program = getHierarchyProgram(cezfestHierarchyDemo, "demo-cezfest-2026");
    const html = renderToStaticMarkup(
      <ActivityHierarchyProgram program={program!} language="cs" onOpen={() => undefined} />,
    );

    expect(html).toContain("Program festivalu");
    expect(html).toContain("Události budou doplněny později");
  });
});
