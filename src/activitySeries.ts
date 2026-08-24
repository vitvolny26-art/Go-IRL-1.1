import type { NewActivity } from "./types";

export const MAX_WEEKLY_SERIES_OCCURRENCES = 104;

type WeeklySeriesBoundary = {
  untilDate?: string;
  occurrenceCount?: number;
};

export type WeeklyActivitySeriesInput = NewActivity & WeeklySeriesBoundary & {
  idempotencyKey: string;
};

export type WeeklyActivitySeriesResult = {
  seriesId: string;
  activityIds: string[];
};

export type WeeklySeriesValidationCode =
  | "invalid_start_date"
  | "exactly_one_boundary_required"
  | "invalid_until_date"
  | "until_before_start"
  | "series_too_long"
  | "occurrence_count_out_of_range";

export type WeeklySeriesResolution =
  | { ok: true; dates: string[] }
  | { ok: false; code: WeeklySeriesValidationCode };

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseDateKey = (value: string) => {
  const match = dateKeyPattern.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const millis = Date.UTC(year, month - 1, day);
  const date = new Date(millis);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return millis;
};

const formatDateKey = (millis: number) => new Date(millis).toISOString().slice(0, 10);

export const resolveWeeklySeriesDates = (
  startDate: string,
  boundary: WeeklySeriesBoundary,
): WeeklySeriesResolution => {
  const start = parseDateKey(startDate);
  if (start === null) return { ok: false, code: "invalid_start_date" };

  const hasUntilDate = Boolean(boundary.untilDate);
  const hasOccurrenceCount = boundary.occurrenceCount !== undefined && boundary.occurrenceCount !== null;
  if (hasUntilDate === hasOccurrenceCount) return { ok: false, code: "exactly_one_boundary_required" };

  if (hasOccurrenceCount) {
    const count = Number(boundary.occurrenceCount);
    if (!Number.isInteger(count) || count < 1 || count > MAX_WEEKLY_SERIES_OCCURRENCES) {
      return { ok: false, code: "occurrence_count_out_of_range" };
    }
    return {
      ok: true,
      dates: Array.from({ length: count }, (_, index) => formatDateKey(start + index * 7 * 86_400_000)),
    };
  }

  const until = parseDateKey(boundary.untilDate || "");
  if (until === null) return { ok: false, code: "invalid_until_date" };
  if (until < start) return { ok: false, code: "until_before_start" };
  if (until > start + (MAX_WEEKLY_SERIES_OCCURRENCES - 1) * 7 * 86_400_000) {
    return { ok: false, code: "series_too_long" };
  }

  const dates: string[] = [];
  for (let current = start; current <= until; current += 7 * 86_400_000) {
    dates.push(formatDateKey(current));
  }
  return { ok: true, dates };
};

export const createActivitySeriesIdempotencyKey = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `act080:${globalThis.crypto.randomUUID()}`;
  }
  return `act080:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
};

export const buildWeeklyActivitySeriesRpcArgs = (input: WeeklyActivitySeriesInput, organizer: string) => ({
  p_category_id: input.categoryId,
  p_activity_text: input.activityText,
  p_title_text: input.titleText,
  p_description_text: input.descriptionText,
  p_start_date: input.date,
  p_event_time: input.time,
  p_city_id: input.cityId,
  p_address: input.address,
  p_location_url: input.locationUrl || "",
  p_participant_note: input.participantNote || "",
  p_activity_type: input.type || (input.categoryId === "sport" ? "sport" : "custom"),
  p_metadata: input.metadata || {},
  p_price: input.price,
  p_capacity: input.capacity,
  p_visibility: input.visibility,
  p_organizer: organizer,
  p_idempotency_key: input.idempotencyKey,
  p_until_date: input.untilDate || null,
  p_occurrence_count: input.occurrenceCount ?? null,
});

export const parseWeeklyActivitySeriesRpcResult = (data: unknown): WeeklyActivitySeriesResult | null => {
  const row = (Array.isArray(data) ? data[0] : data) as { series_id?: unknown; activity_ids?: unknown } | null;
  const seriesId = typeof row?.series_id === "string" ? row.series_id : "";
  const activityIds = Array.isArray(row?.activity_ids)
    ? row.activity_ids.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  return seriesId && activityIds.length ? { seriesId, activityIds } : null;
};
