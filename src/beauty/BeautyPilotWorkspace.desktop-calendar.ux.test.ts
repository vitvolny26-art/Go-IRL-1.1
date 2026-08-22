import { describe, expect, it } from "vitest";
import workspaceSource from "./BeautyPilotWorkspace.tsx?raw";
import { readFileSync } from "node:fs";

const desktopCss = readFileSync(new URL("./beauty-workspace-desktop.css", import.meta.url), "utf8");

describe("GROOMING002-E desktop calendar layout", () => {
  it("keeps calendar behavior intact while composing appointments as a desktop workspace", () => {
    expect(workspaceSource).toContain("beauty-workspace-appointments-view");
    expect(workspaceSource).toContain("beauty-workspace-calendar-primary");
    expect(workspaceSource).toContain("beauty-workspace-appointments-secondary");
    expect(workspaceSource).toContain("calendarAppointments");
    expect(workspaceSource).toContain("BeautyBookingConfirmationModeControl");
    expect(desktopCss).toContain("grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.55fr)");
    expect(desktopCss).toContain("grid-row: 2 / span 3");
    expect(desktopCss).toContain("min-height: 390px");
  });
});
