import { describe, expect, it } from "vitest";
import {
  buildActivitySeriesCancelRpcArgs,
  buildActivitySeriesUpdateRpcArgs,
  diffIsoDateDays,
  shiftIsoDate,
  type ActivitySeriesMutationScope,
} from "./activitySeriesMutation";
import type { NewActivity } from "./types";

const activity: NewActivity = {
  type: "sport",
  categoryId: "sport",
  activityText: "Volleyball",
  titleText: "Sunday volleyball",
  descriptionText: "Weekly game",
  date: "2026-09-06",
  time: "19:00",
  cityId: "olomouc",
  address: "Sports hall",
  locationUrl: "https://maps.example.test/hall",
  participantNote: "Bring shoes",
  price: 100,
  capacity: 8,
  visibility: "public",
  metadata: { sport: { sportType: "Volleyball" } },
};

describe("ACT080-005B recurring series mutation client contract", () => {
  it.each<ActivitySeriesMutationScope>(["single", "following"])("maps %s update scope to the RPC payload", (scope) => {
    expect(buildActivitySeriesUpdateRpcArgs("activity-1", scope, activity)).toEqual({
      p_activity_id: "activity-1",
      p_scope: scope,
      p_category_id: "sport",
      p_activity_text: "Volleyball",
      p_title_text: "Sunday volleyball",
      p_description_text: "Weekly game",
      p_event_date: "2026-09-06",
      p_event_time: "19:00",
      p_city_id: "olomouc",
      p_address: "Sports hall",
      p_location_url: "https://maps.example.test/hall",
      p_participant_note: "Bring shoes",
      p_activity_type: "sport",
      p_metadata: { sport: { sportType: "Volleyball" } },
      p_price: 100,
      p_capacity: 8,
      p_visibility: "public",
    });
  });

  it("maps cancel scope without leaking unrelated fields", () => {
    expect(buildActivitySeriesCancelRpcArgs("activity-1", "following")).toEqual({
      p_activity_id: "activity-1",
      p_scope: "following",
    });
  });

  it("shifts future concrete occurrence dates by the selected occurrence delta", () => {
    expect(diffIsoDateDays("2026-09-08", "2026-09-06")).toBe(2);
    expect(shiftIsoDate("2026-09-13", 2)).toBe("2026-09-15");
    expect(shiftIsoDate("2026-09-20", -7)).toBe("2026-09-13");
  });
});
