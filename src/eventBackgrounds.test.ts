import { describe, expect, it } from "vitest";
import { getEventBackground, getEventShareBackground, getEventSheetBackground } from "./eventBackgrounds";

describe("event backgrounds", () => {
  it("loads the original 4x3 dinner photo for card 32", () => {
    expect(getEventBackground("DR")).toMatch(/\/activities\/share-4x3\/32-dinner.*\.webp/);
  });

  it("loads the 6x5 dinner photo for catalog share-card visual", () => {
    expect(getEventShareBackground("DR")).toMatch(/\/activities\/share-6x5\/32-dinner.*\.webp/);
  });

  it("loads the 9x16 dinner photo for event sheets", () => {
    expect(getEventSheetBackground("DR")).toMatch(/\/activities\/sheets-9x16\/32-dinner.*\.webp/);
  });
});
