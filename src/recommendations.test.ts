import { describe, expect, it } from "vitest";
import { cezfestHierarchyDemo } from "./activityHierarchyDemo";
import { actionableSurpriseActivities, applyDiscoverFilters, genericRecommendationEngine, matchesActivityHierarchyInterest, plannedRecommendationEngines, searchActivities, simpleRecommendationEngine } from "./recommendations";
import type { Activity } from "./types";

const makeActivity = (overrides: Partial<Activity>): Activity => ({
  id: "event-1",
  categoryId: "activities",
  activity: { ru: "☕ Кофе", uk: "☕ Кава", cs: "☕ Káva", en: "☕ Coffee" },
  title: { ru: "Кофе в центре", uk: "Кава в центрі", cs: "Káva v centru", en: "Coffee downtown" },
  description: { ru: "Для новичков", uk: "Для новачків", cs: "Pro začátečníky", en: "For beginners" },
  date: "2026-07-05",
  time: "18:00",
  cityId: "olomouc",
  address: "Horní náměstí",
  price: 0,
  capacity: 6,
  participants: 2,
  members: [],
  organizer: "Vit",
  organizerKey: "owner",
  visibility: "public",
  ...overrides,
});

describe("SimpleRecommendationEngine", () => {
  it("keeps a stable generic engine contract for future vertical and AI engines", () => {
    expect(genericRecommendationEngine.id).toBe("generic");
    expect(plannedRecommendationEngines).toEqual(expect.arrayContaining(["friends", "dating", "ai"]));
  });

  it("prioritizes user city, interests, date, and free spots", () => {
    const cityInterest = makeActivity({ id: "match", cityId: "olomouc", date: "2026-07-05", participants: 1 });
    const otherCity = makeActivity({ id: "other-city", cityId: "praha", date: "2026-07-05", participants: 1 });
    const fullEvent = makeActivity({ id: "full", cityId: "olomouc", date: "2026-07-05", participants: 6 });

    const result = simpleRecommendationEngine.recommend([otherCity, fullEvent, cityInterest], {
      cityId: "olomouc",
      favoriteActivities: ["Кофе"],
      language: "ru",
      now: new Date("2026-07-04T10:00:00"),
    });

    expect(result.map((activity) => activity.id)).toEqual(["match", "full", "other-city"]);
  });

  it("recommends a festival root instead of flattening its categories and child events", () => {
    const result = simpleRecommendationEngine.recommend(cezfestHierarchyDemo, {
      cityId: "olomouc",
      favoriteActivities: [],
      language: "en",
      now: new Date("2026-09-01T10:00:00"),
    });

    expect(result.map((activity) => activity.id)).toEqual(["demo-cezfest-2026"]);
  });

  it("lets a festival root inherit interest relevance from its child program", () => {
    const root = cezfestHierarchyDemo.find((activity) => activity.id === "demo-cezfest-2026")!;

    expect(matchesActivityHierarchyInterest(cezfestHierarchyDemo, root, ["running"], "en")).toBe(true);
    expect(matchesActivityHierarchyInterest(cezfestHierarchyDemo, root, ["yoga"], "en")).toBe(false);
  });
});

describe("actionableSurpriseActivities", () => {
  const now = new Date("2026-07-04T10:00:00");
  const filter = (activities: Activity[], overrides: Partial<Parameters<typeof actionableSurpriseActivities>[1]> = {}) =>
    actionableSurpriseActivities(activities, {
      userKey: "current-user",
      joinedIds: [],
      waitingIds: [],
      pendingIds: [],
      now,
      ...overrides,
    }).map((activity) => activity.id);

  it("excludes own, joined, pending, waiting, finished, cancelled, private, and unsupported full events", () => {
    const available = makeActivity({ id: "available", organizerKey: "other", date: "2026-07-05" });
    const own = makeActivity({ id: "own", organizerKey: "current-user", date: "2026-07-05" });
    const joined = makeActivity({ id: "joined", organizerKey: "other", date: "2026-07-05" });
    const pending = makeActivity({ id: "pending", organizerKey: "other", date: "2026-07-05", visibility: "invite" });
    const waiting = makeActivity({ id: "waiting", organizerKey: "other", date: "2026-07-05" });
    const finished = makeActivity({ id: "finished", organizerKey: "other", date: "2026-07-03" });
    const cancelled = makeActivity({ id: "cancelled", organizerKey: "other", date: "2026-07-05" });
    const privateEvent = makeActivity({ id: "private", organizerKey: "other", date: "2026-07-05", visibility: "private" });
    const full = makeActivity({ id: "full", organizerKey: "other", date: "2026-07-05", participants: 6, capacity: 6 });

    expect(filter(
      [own, joined, pending, waiting, finished, cancelled, privateEvent, full, available],
      { joinedIds: ["joined"], pendingIds: ["pending"], waitingIds: ["waiting"], cancelledIds: ["cancelled"] },
    )).toEqual(["available"]);
  });

  it("includes a public event with space and a full event only when its waiting-list path is supported", () => {
    const available = makeActivity({ id: "available", organizerKey: "other", date: "2026-07-05" });
    const full = makeActivity({ id: "full", organizerKey: "other", date: "2026-07-05", participants: 6, capacity: 6 });

    expect(filter([available, full])).toEqual(["available"]);
    expect(filter([available, full], { waitingListEnabledIds: ["full"] })).toEqual(["available", "full"]);
  });

  it("never chooses hierarchy containers as a surprise join target", () => {
    const result = actionableSurpriseActivities(cezfestHierarchyDemo, {
      userKey: "current-user",
      joinedIds: [],
      waitingIds: [],
      pendingIds: [],
      now: new Date("2026-09-01T10:00:00"),
    });

    expect(result.some((activity) => activity.id === "demo-cezfest-2026")).toBe(false);
    expect(result.some((activity) => activity.id === "demo-cezfest-sport")).toBe(false);
    expect(result.some((activity) => activity.id === "demo-cezfest-running")).toBe(true);
  });
});

describe("discover filters", () => {
  it("filters instantly by price, visibility, and activity type", () => {
    const freeSkating = makeActivity({
      id: "skating",
      activity: { ru: "🛼 Ролики", uk: "🛼 Ролики", cs: "🛼 Inline bruslení", en: "🛼 Inline skating" },
      price: 0,
      visibility: "public",
    });
    const paidPrivate = makeActivity({ id: "private", price: 300, visibility: "private" });

    const result = applyDiscoverFilters([freeSkating, paidPrivate], ["free", "public-only", "skating"], "ru", new Date("2026-07-04T10:00:00"));

    expect(result).toEqual([freeSkating]);
  });

  it("searches by city and organizer", () => {
    const prague = makeActivity({ id: "praha", cityId: "praha", organizer: "Andrej" });

    expect(searchActivities([prague], "Прага", "ru")).toEqual([prague]);
    expect(searchActivities([prague], "Andrej", "ru")).toEqual([prague]);
  });

  it("shows only festival roots by default, keeps explicit leaf-event search, and hides hierarchy categories", () => {
    expect(searchActivities(cezfestHierarchyDemo, "", "en").map((activity) => activity.id)).toEqual(["demo-cezfest-2026"]);
    expect(searchActivities(cezfestHierarchyDemo, "Running", "en").map((activity) => activity.id)).toEqual(["demo-cezfest-running"]);
    expect(searchActivities(cezfestHierarchyDemo, "Festival sport program.", "en")).toEqual([]);
  });
});
