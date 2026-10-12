import { describe, expect, it } from "vitest";
import { seedActivities } from "./data";
import { isOutdoorGenericActivity } from "./eventWeather";

describe("event weather eligibility", () => {
  it("recognizes outdoor generic events", () => {
    const walking = {
      ...seedActivities[0],
      type: "custom" as const,
      categoryId: "social",
      activity: { ru: "Прогулка", uk: "Прогулянка", cs: "Procházka", en: "Walking" , pl: "Walking", sk: "Procházka"},
    };
    expect(isOutdoorGenericActivity(walking)).toBe(true);
  });

  it("treats Mushroom picking in Nature as weather-enabled", () => {
    const mushroomPicking = {
      ...seedActivities[0],
      type: "custom" as const,
      categoryId: "nature",
      activity: {
        ru: "Идём за грибами",
        uk: "Йдемо по гриби",
        cs: "Jdeme na houby",
        en: "Mushroom picking",
        pl: "Idziemy na grzyby",
        sk: "Ideme na huby",
      },
    };
    expect(isOutdoorGenericActivity(mushroomPicking)).toBe(true);
  });

  it("leaves sport weather eligibility to sport metadata", () => {
    expect(isOutdoorGenericActivity(seedActivities[0])).toBe(false);
  });
});
