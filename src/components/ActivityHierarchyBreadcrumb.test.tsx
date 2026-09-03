import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cezfestHierarchyDemo } from "../activityHierarchyDemo";
import { ActivityHierarchyBreadcrumb } from "./ActivityHierarchyBreadcrumb";

describe("ActivityHierarchyBreadcrumb", () => {
  it("shows the festival root and parent category for a leaf event", () => {
    const running = cezfestHierarchyDemo.find((activity) => activity.id === "demo-cezfest-running")!;
    const html = renderToStaticMarkup(
      <ActivityHierarchyBreadcrumb
        activities={cezfestHierarchyDemo}
        activity={running}
        language="en"
        onOpenRoot={() => undefined}
      />,
    );

    expect(html).toContain("ČEZFEST 2026");
    expect(html).toContain("Sport");
    expect(html).toContain('data-activity-id="demo-cezfest-2026"');
  });

  it("renders nothing on the festival root", () => {
    const root = cezfestHierarchyDemo.find((activity) => activity.id === "demo-cezfest-2026")!;
    const html = renderToStaticMarkup(
      <ActivityHierarchyBreadcrumb
        activities={cezfestHierarchyDemo}
        activity={root}
        language="en"
        onOpenRoot={() => undefined}
      />,
    );

    expect(html).toBe("");
  });
});
