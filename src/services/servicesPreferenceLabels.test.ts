import { describe, expect, it } from "vitest";
import { servicesPreferenceLabel } from "./servicesPreferenceLabels";

const canonicalPreferences = ["Маникюр", "Волосы", "Брови и ресницы", "Массаж", "Уход за лицом"];

describe("WEB001-D7 Czech Services filter labels", () => {
  it("renders Czech display labels for canonical Services filters", () => {
    expect(canonicalPreferences.map((value) => servicesPreferenceLabel(value, "cs"))).toEqual([
      "Manikúra",
      "Vlasy",
      "Obočí a řasy",
      "Masáž",
      "Péče o pleť",
    ]);
  });

  it("preserves canonical values outside Czech and unknown Czech values", () => {
    expect(servicesPreferenceLabel("Маникюр", "ru")).toBe("Маникюр");
    expect(servicesPreferenceLabel("Unknown", "cs")).toBe("Unknown");
  });
});
