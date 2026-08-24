import type { NewActivity } from "./types";

export type ActivitySeriesMutationScope = "single" | "following";

export const buildActivitySeriesUpdateRpcArgs = (
  activityId: string,
  scope: ActivitySeriesMutationScope,
  input: NewActivity,
) => ({
  p_activity_id: activityId,
  p_scope: scope,
  p_category_id: input.categoryId,
  p_activity_text: input.activityText,
  p_title_text: input.titleText,
  p_description_text: input.descriptionText,
  p_event_date: input.date,
  p_event_time: input.time,
  p_city_id: input.cityId,
  p_address: input.address,
  p_location_url: input.locationUrl || null,
  p_participant_note: input.participantNote || null,
  p_activity_type: input.type || "custom",
  p_metadata: input.metadata || {},
  p_price: input.price,
  p_capacity: input.capacity,
  p_visibility: input.visibility,
});

export const buildActivitySeriesCancelRpcArgs = (
  activityId: string,
  scope: ActivitySeriesMutationScope,
) => ({
  p_activity_id: activityId,
  p_scope: scope,
});

const isoDateUtc = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export const diffIsoDateDays = (nextDate: string, currentDate: string) => {
  const next = isoDateUtc(nextDate);
  const current = isoDateUtc(currentDate);
  if (!Number.isFinite(next) || !Number.isFinite(current)) return Number.NaN;
  return Math.round((next - current) / 86_400_000);
};

export const shiftIsoDate = (value: string, days: number) => {
  const timestamp = isoDateUtc(value);
  if (!Number.isFinite(timestamp) || !Number.isInteger(days)) return value;
  return new Date(timestamp + days * 86_400_000).toISOString().slice(0, 10);
};
