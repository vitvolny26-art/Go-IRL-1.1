import { describe, expect, it } from "vitest";
import workspaceSource from "./BeautyPilotWorkspace.tsx?raw";

describe("Beauty master booking lifecycle controls", () => {
  it("keeps completed and no-show actions locked until the appointment has ended", () => {
    expect(workspaceSource).toContain("appointmentLifecycleAvailable");
    expect(workspaceSource).toContain("startsAt + durationMs <= now");
    expect(workspaceSource).toContain("transitionBusy || !currentLifecycleAvailable");
    expect(workspaceSource).toContain("text.lifecycleLocked");
  });
});
