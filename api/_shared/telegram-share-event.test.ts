import { describe, expect, it } from "vitest";
import { isIndexableEventVisibility, isShareableEventVisibility } from "./telegram-share-event.js";

describe("shareable event visibility", () => {
  it("allows public and invite-only events shared by their UUID", () => {
    expect(isShareableEventVisibility("public")).toBe(true);
    expect(isShareableEventVisibility("invite")).toBe(true);
  });

  it("does not expose private events through public Meta endpoints", () => {
    expect(isShareableEventVisibility("private")).toBe(false);
  });

  it("indexes only public activities", () => {
    expect(isIndexableEventVisibility("public")).toBe(true);
    expect(isIndexableEventVisibility("invite")).toBe(false);
    expect(isIndexableEventVisibility("private")).toBe(false);
  });
});
