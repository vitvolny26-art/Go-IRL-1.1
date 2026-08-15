import { describe, expect, it } from "vitest";
import { getEventBackground, getEventShareBackground } from "./eventBackgrounds";

describe("event backgrounds", () => {
  it("loads the dedicated dinner photo for card 32", () => {
    expect(getEventBackground("DR")).toMatch(/32-dinner.*\.webp/);
  });

  it("loads the 6x5 dinner photo for catalog share-card visual", () => {
    expect(getEventShareBackground("DR")).toMatch(/\/activities\/share-6x5\/32-dinner.*\.webp/);
  });
});
