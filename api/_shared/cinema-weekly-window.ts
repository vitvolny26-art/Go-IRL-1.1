export const CINEMA_WEEKLY_TIMEZONE = "Europe/Prague";

export type CinemaWeeklyWindow = {
  timezone: typeof CINEMA_WEEKLY_TIMEZONE;
  week_start: string;
  week_end: string;
};

export type CinemaWeeklyWindowCandidate = {
  id: string;
  movie_id: string;
  city_id: string;
  city_name: string;
  title: string;
  showing_from: string;
  showing_until: string;
  score: number;
  priority: string;
  lifecycle_status: string;
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const formatLocalDate = (instant: Date, timezone: string) => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
  } catch {
    throw new Error("cinema_weekly_window_timezone_invalid");
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!values.year || !values.month || !values.day) {
    throw new Error("cinema_weekly_window_local_date_invalid");
  }
  return `${values.year}-${values.month}-${values.day}`;
};

const dateParts = (value: string) => {
  if (!isoDate.test(value)) throw new Error("cinema_weekly_window_date_invalid");
  const [year, month, day] = value.split("-").map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    instant.getUTCFullYear() !== year
    || instant.getUTCMonth() !== month - 1
    || instant.getUTCDate() !== day
  ) {
    throw new Error("cinema_weekly_window_date_invalid");
  }
  return { year, month, day, instant };
};

const addCalendarDays = (value: string, days: number) => {
  const { instant } = dateParts(value);
  instant.setUTCDate(instant.getUTCDate() + days);
  return [
    String(instant.getUTCFullYear()).padStart(4, "0"),
    String(instant.getUTCMonth() + 1).padStart(2, "0"),
    String(instant.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

const isoWeekday = (value: string) => {
  const { instant } = dateParts(value);
  const weekday = instant.getUTCDay();
  return weekday === 0 ? 7 : weekday;
};

export const computeNextCinemaWeeklyWindow = (
  now: Date = new Date(),
): CinemaWeeklyWindow => {
  if (!Number.isFinite(now.getTime())) throw new Error("cinema_weekly_window_now_invalid");

  const localDate = formatLocalDate(now, CINEMA_WEEKLY_TIMEZONE);
  const daysUntilNextMonday = 8 - isoWeekday(localDate);
  const weekStart = addCalendarDays(localDate, daysUntilNextMonday);
  const weekEnd = addCalendarDays(weekStart, 6);

  return {
    timezone: CINEMA_WEEKLY_TIMEZONE,
    week_start: weekStart,
    week_end: weekEnd,
  };
};

export const candidateIntersectsWeeklyWindow = (
  candidate: Pick<CinemaWeeklyWindowCandidate, "showing_from" | "showing_until" | "lifecycle_status">,
  window: Pick<CinemaWeeklyWindow, "week_start" | "week_end">,
) => {
  dateParts(candidate.showing_from);
  dateParts(candidate.showing_until);
  dateParts(window.week_start);
  dateParts(window.week_end);

  if (candidate.showing_until < candidate.showing_from) {
    throw new Error("cinema_weekly_candidate_window_invalid");
  }
  if (window.week_end < window.week_start) {
    throw new Error("cinema_weekly_window_invalid");
  }

  return candidate.lifecycle_status === "active"
    && candidate.showing_from <= window.week_end
    && candidate.showing_until >= window.week_start;
};

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

export const filterCinemaWeeklyWindowCandidates = (
  candidates: CinemaWeeklyWindowCandidate[],
  window: CinemaWeeklyWindow,
  cityId: string,
) => {
  const normalizedCityId = cityId.trim();
  if (!normalizedCityId || normalizedCityId.length > 80) {
    throw new Error("cinema_weekly_window_city_invalid");
  }

  return candidates
    .filter((candidate) => {
      if (!candidate.id || !candidate.movie_id || !candidate.city_id || !candidate.title) {
        throw new Error("cinema_weekly_candidate_identity_incomplete");
      }
      return candidate.city_id === normalizedCityId
        && candidateIntersectsWeeklyWindow(candidate, window);
    })
    .sort((left, right) =>
      compareText(left.showing_from, right.showing_from)
      || compareText(left.showing_until, right.showing_until)
      || compareText(left.title, right.title)
      || compareText(left.id, right.id)
    );
};
