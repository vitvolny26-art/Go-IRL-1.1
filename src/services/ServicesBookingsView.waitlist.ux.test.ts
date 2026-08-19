import { describe, expect, it } from "vitest";
import viewSource from "./ServicesBookingsView.tsx?raw";

describe("Beauty client waitlist wiring", () => {
  it("loads server waitlist entries without a local waitlist fallback", () => {
    expect(viewSource).toContain("loadMyServiceWaitlist(language)");
    expect(viewSource).toContain('snapshot.source !== "server"');
    expect(viewSource).not.toContain("createLocalWaitlist");
  });

  it("lets the client cancel an owned active waitlist entry", () => {
    expect(viewSource).toContain("cancelServiceWaitlist(entry)");
    expect(viewSource).toContain('entry.status === "active"');
    expect(viewSource).toContain("text.notReserved");
  });
});
