import { describe, expect, it } from "vitest";
import {
  canDisableNotification,
  getNotificationRegistryEntry,
  notificationRegistry,
} from "./contracts";

describe("notification data model contracts", () => {
  it("registers every kind exactly once", () => {
    const kinds = notificationRegistry.map((entry) => entry.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toContain("participation.event_cancelled");
    expect(kinds).toContain("communication.mention");
    expect(kinds).toContain("weather.thunderstorm");
    expect(kinds).toContain("services.booking_requested");
    expect(kinds).toContain("services.booking_confirmed");
    expect(kinds).toContain("services.booking_declined");
    expect(kinds).toContain("services.booking_cancelled");
    expect(kinds).toContain("services.waitlist_slot_available");
  });

  it("keeps service-critical notifications enabled", () => {
    expect(canDisableNotification("participation.event_cancelled")).toBe(false);
    expect(canDisableNotification("organizer.new_request")).toBe(false);
    expect(canDisableNotification("services.booking_confirmed")).toBe(false);
    expect(canDisableNotification("services.waitlist_slot_available")).toBe(true);
    expect(canDisableNotification("communication.message")).toBe(true);
  });

  it("assigns in-app delivery to every registry entry", () => {
    expect(notificationRegistry.every((entry) => entry.defaultChannels.includes("in_app"))).toBe(true);
  });

  it("resolves registered kinds from the runtime registry", () => {
    expect(getNotificationRegistryEntry("communication.message")).toMatchObject({
      category: "communication",
      serviceCritical: false,
    });
    expect(getNotificationRegistryEntry("services.booking_requested")).toMatchObject({
      category: "services",
      serviceCritical: true,
      defaultChannels: ["in_app", "telegram"],
    });
    expect(getNotificationRegistryEntry("services.waitlist_slot_available")).toMatchObject({
      category: "services",
      serviceCritical: false,
      defaultChannels: ["in_app", "telegram"],
    });
  });
});