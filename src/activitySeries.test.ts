import { describe, expect, it } from "vitest";
import {
  MAX_WEEKLY_SERIES_OCCURRENCES,
  buildWeeklyActivitySeriesRpcArgs,
  createActivitySeriesIdempotencyKey,
  parseWeeklyActivitySeriesRpcResult,
  resolveWeeklySeriesDates,
  type WeeklyActivitySeriesInput,
} from "./activitySeries";

const input: WeeklyActivitySeriesInput = {
  type: "sport",
  categoryId: "sport",
  activityText: "Volleyball",
  titleText: "Sunday volleyball",
  descriptionText: "Weekly game",
  date: "2026-08-30",
  time: "18:00",
  cityId: "olomouc",
  address: "Sports hall",
  locationUrl: "https://maps.example.test/hall",
  participantNote: "Bring shoes",
  price: 100,
  capacity: 8,
  visibility: "public",
  metadata: { sport: { sportType: "Volleyball" } },
  idempotencyKey: "act080:test-series-0001",
  occurrenceCount: 4,
};

describe("ACT080-005B weekly Activity series client contract", () => {
  it("materializes a weekly Sunday cadence by occurrence count", () => {
    expect(resolveWeeklySeriesDates("2026-08-30", { occurrenceCount: 4 })).toEqual({
      ok: true,
      dates: ["2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20"],
    });
  });

  it("materializes occurrences up to an inclusive end date", () => {
    expect(resolveWeeklySeriesDates("2026-08-30", { untilDate: "2026-09-20" })).toEqual({
      ok: true,
      dates: ["2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20"],
    });
  });

  it("requires exactly one finite boundary and enforces the 104 cap", () => {
    expect(resolveWeeklySeriesDates("2026-08-30", {})).toEqual({ ok: false, code: "exactly_one_boundary_required" });
    expect(resolveWeeklySeriesDates("2026-08-30", { untilDate: "2026-09-20", occurrenceCount: 4 }))
      .toEqual({ ok: false, code: "exactly_one_boundary_required" });
    expect(resolveWeeklySeriesDates("2026-08-30", { occurrenceCount: MAX_WEEKLY_SERIES_OCCURRENCES + 1 }))
      .toEqual({ ok: false, code: "occurrence_count_out_of_range" });
    expect(resolveWeeklySeriesDates("2026-08-30", { untilDate: "2028-08-27" }))
      .toEqual({ ok: false, code: "series_too_long" });
  });

  it("maps the Create payload to the deployed S1 RPC contract", () => {
    expect(buildWeeklyActivitySeriesRpcArgs(input, "Owner")).toEqual({
      p_category_id: "sport",
      p_activity_text: "Volleyball",
      p_title_text: "Sunday volleyball",
      p_description_text: "Weekly game",
      p_start_date: "2026-08-30",
      p_event_time: "18:00",
      p_city_id: "olomouc",
      p_address: "Sports hall",
      p_location_url: "https://maps.example.test/hall",
      p_participant_note: "Bring shoes",
      p_activity_type: "sport",
      p_metadata: { sport: { sportType: "Volleyball" } },
      p_price: 100,
      p_capacity: 8,
      p_visibility: "public",
      p_organizer: "Owner",
      p_idempotency_key: "act080:test-series-0001",
      p_until_date: null,
      p_occurrence_count: 4,
    });
  });

  it("parses an ordered materialization result and generates a safe retry key", () => {
    expect(parseWeeklyActivitySeriesRpcResult([{ series_id: "series-1", activity_ids: ["a1", "a2"] }]))
      .toEqual({ seriesId: "series-1", activityIds: ["a1", "a2"] });
    const key = createActivitySeriesIdempotencyKey();
    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(key).toMatch(/^[A-Za-z0-9._:-]+$/);
  });
});
