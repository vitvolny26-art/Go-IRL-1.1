import { describe, expect, it } from "vitest";
import {
  buildOrganizerTrustSummary,
  parseOrganizerTrustProjection,
} from "./organizerTrustProjection";

describe("UProfile017 organizer trust projection", () => {
  it("parses the bounded derived organizer stats contract", () => {
    expect(parseOrganizerTrustProjection({
      average_rating: "4.84",
      rating_count: "37",
      completed_activity_count: 12,
    })).toEqual({
      averageRating: 4.84,
      ratingCount: 37,
      completedActivityCount: 12,
    });
  });

  it("requires a nullable average when no eligible ratings exist", () => {
    expect(parseOrganizerTrustProjection({
      average_rating: null,
      rating_count: 0,
      completed_activity_count: 3,
    })).toEqual({ averageRating: null, ratingCount: 0, completedActivityCount: 3 });

    expect(parseOrganizerTrustProjection({
      average_rating: 0,
      rating_count: 0,
      completed_activity_count: 3,
    })).toBeNull();
  });

  it("rejects impossible counts and rating averages", () => {
    expect(parseOrganizerTrustProjection({
      average_rating: 4.8,
      rating_count: -1,
      completed_activity_count: 3,
    })).toBeNull();
    expect(parseOrganizerTrustProjection({
      average_rating: 5.1,
      rating_count: 1,
      completed_activity_count: 3,
    })).toBeNull();
    expect(parseOrganizerTrustProjection({
      average_rating: null,
      rating_count: 1,
      completed_activity_count: 3,
    })).toBeNull();
  });

  it("renders the canonical public summary from the first eligible rating", () => {
    expect(buildOrganizerTrustSummary({
      averageRating: 4.84,
      ratingCount: 37,
      completedActivityCount: 12,
    }, "ru")).toBe("⭐ 4.8 · 37 оценок · 12 мероприятий");

    expect(buildOrganizerTrustSummary({
      averageRating: 4.8,
      ratingCount: 1,
      completedActivityCount: 5,
    }, "en")).toBe("⭐ 4.8 · 1 rating · 5 events");
  });

  it("never renders a fake zero-star rating", () => {
    expect(buildOrganizerTrustSummary({
      averageRating: null,
      ratingCount: 0,
      completedActivityCount: 0,
    }, "ru")).toBe("Новый организатор · 0 мероприятий");

    expect(buildOrganizerTrustSummary({
      averageRating: null,
      ratingCount: 0,
      completedActivityCount: 3,
    }, "ru")).toBe("3 мероприятия · Пока нет оценок");
  });

  it("keeps the same projection portable across all six display locales", () => {
    const projection = { averageRating: 5, ratingCount: 2, completedActivityCount: 2 } as const;
    for (const locale of ["ru", "uk", "cs", "en", "pl", "sk"] as const) {
      expect(buildOrganizerTrustSummary(projection, locale)).toContain("⭐ 5.0");
    }
  });
});
