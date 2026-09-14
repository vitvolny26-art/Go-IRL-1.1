import { describe, expect, it } from "vitest";
import { seedActivities } from "../data";
import { sportRecommendationEngine } from "./sport";
import { activityRendererRegistry, resolveActivityExperience, supportedFutureVerticals } from "./registry";
import type { Activity } from "../types";

const makeSport = (overrides: Partial<Activity>): Activity => ({
  id: "sport-1",
  type: "sport",
  categoryId: "sport",
  activity: { ru: "🏐 Волейбол", uk: "🏐 Волейбол", cs: "🏐 Volejbal", en: "🏐 Volleyball" , pl: "🏐 Volleyball", sk: "🏐 Volejbal"},
  title: { ru: "Игра", uk: "Гра", cs: "Hra", en: "Game" , pl: "Game", sk: "Hra"},
  description: { ru: "Описание", uk: "Опис", cs: "Popis", en: "Description" , pl: "Description", sk: "Popis"},
  date: "2026-07-08",
  time: "18:00",
  cityId: "olomouc",
  address: "Beach Arena",
  price: 0,
  capacity: 8,
  participants: 2,
  members: [],
  organizer: "Vit",
  organizerKey: "owner",
  visibility: "public",
  metadata: {
    sport: {
      sportType: "Volleyball",
      level: "beginner",
      format: "casual",
      environment: "outdoor",
      durationMinutes: 90,
    },
  },
  ...overrides,
});

describe("ActivityRendererRegistry", () => {
  it("routes sport activities to the Sport vertical and keeps Generic as fallback", () => {
    expect(activityRendererRegistry.sport.activityTypes).toEqual(["sport"]);
    expect(resolveActivityExperience(makeSport({})).type).toBe("sport");
    expect(resolveActivityExperience(makeSport({ type: "custom", categoryId: "activities" })).type).toBe("generic");
    expect(supportedFutureVerticals).toEqual(expect.arrayContaining(["dating", "friends", "food", "travel", "culture"]));
  });
});

describe("SportRecommendationEngine", () => {
  it("exposes a sport-specific recommendation engine id", () => {
    expect(sportRecommendationEngine.id).toBe("sport");
  });

  it("prioritizes city, sport type, skill level, and free places", () => {
    const best = makeSport({ id: "best", participants: 1 });
    const otherSport = makeSport({
      id: "other-sport",
      metadata: { sport: { sportType: "Tennis", level: "beginner", environment: "outdoor" } },
    });
    const otherCity = makeSport({ id: "other-city", cityId: "praha" });

    const result = sportRecommendationEngine.recommend([otherSport, otherCity, best], {
      cityId: "olomouc",
      favoriteActivities: [],
      language: "en",
      preferredSportLevel: "beginner",
      preferredSportTypes: ["Volleyball"],
      now: new Date("2026-07-04T10:00:00"),
    });

    expect(result.map((activity) => activity.id)).toEqual(["best", "other-sport", "other-city"]);
  });

  it("ships complete sport demo data for MVP examples", () => {
    const sportNames = seedActivities.map((activity) => activity.metadata?.sport?.sportType);
    expect(sportNames).toEqual(
      expect.arrayContaining(["Football", "Volleyball", "Tennis", "Running", "Cycling", "Inline skating", "Hiking", "Swimming", "Badminton", "Fitness"]),
    );
  });
});
