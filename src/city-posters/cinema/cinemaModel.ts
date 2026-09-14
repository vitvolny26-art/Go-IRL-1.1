export type CinemaPosterTimeFilter = "now" | "today" | "tomorrow" | "weekend";

export type CityPosterCinemaRow = {
  screening_id: string;
  movie_id: string;
  cinema_id: string;
  cinema_name: string;
  cinema_address: string | null;
  venue_timezone: string;
  movie_title: string;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  genres: unknown;
  age_rating: string | null;
  imdb_rating: number | null;
  poster_url: string | null;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  local_date: string;
  local_time: string;
  audio_language: string | null;
  subtitle_languages: unknown;
  version_type: string | null;
  format: string | null;
  auditorium: string | null;
  screening_tags: unknown;
  ticket_url: string | null;
  source_url: string | null;
};

export type CinemaPosterMovieGroup = {
  movieId: string;
  firstStart: string;
  rows: CityPosterCinemaRow[];
};

const stringList = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
  : [];

export const cinemaStringList = stringList;

const normalize = (value: string | null | undefined) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const zonedDateKey = (date: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
};

const addDays = (dateKey: string, amount: number) => {
  const value = new Date(`${dateKey}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

const weekendDateKeys = (today: string) => {
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  if (day === 6) return new Set([today, addDays(today, 1)]);
  if (day === 0) return new Set([today]);
  const saturday = addDays(today, 6 - day);
  return new Set([saturday, addDays(saturday, 1)]);
};

const matchesTime = (
  row: CityPosterCinemaRow,
  filter: CinemaPosterTimeFilter,
  now: Date,
) => {
  const timezone = row.venue_timezone || "Europe/Prague";
  const today = zonedDateKey(now, timezone);
  if (filter === "today") return row.local_date === today;
  if (filter === "tomorrow") return row.local_date === addDays(today, 1);
  if (filter === "weekend") return weekendDateKeys(today).has(row.local_date);

  const startsAt = new Date(row.starts_at).getTime();
  const endsAt = row.ends_at ? new Date(row.ends_at).getTime() : Number.NaN;
  const nowMs = now.getTime();
  const stillRunning = Number.isFinite(endsAt) && startsAt <= nowMs && endsAt >= nowMs;
  return Number.isFinite(startsAt)
    && (stillRunning || (startsAt >= nowMs - 30 * 60_000 && startsAt <= nowMs + 4 * 60 * 60_000));
};

const matchesQuery = (row: CityPosterCinemaRow, query: string) => {
  const needle = normalize(query);
  if (!needle) return !query.trim();
  const haystack = normalize([
    row.movie_title,
    row.original_title,
    row.cinema_name,
    row.cinema_address,
    ...stringList(row.genres),
  ].filter(Boolean).join(" "));
  return haystack.includes(needle);
};

export const selectCinemaPosterRows = (
  rows: CityPosterCinemaRow[],
  options: {
    timeFilter: CinemaPosterTimeFilter;
    query?: string;
    now?: Date;
  },
) => {
  const now = options.now || new Date();
  return rows
    .filter((row) => matchesTime(row, options.timeFilter, now))
    .filter((row) => matchesQuery(row, options.query || ""))
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
};

export const groupCinemaPosterMovies = (rows: CityPosterCinemaRow[]): CinemaPosterMovieGroup[] => {
  const groups = new Map<string, CityPosterCinemaRow[]>();
  rows.forEach((row) => {
    const group = groups.get(row.movie_id) || [];
    group.push(row);
    groups.set(row.movie_id, group);
  });
  return [...groups.entries()]
    .map(([movieId, movieRows]) => {
      const sorted = [...movieRows].sort((left, right) => left.starts_at.localeCompare(right.starts_at));
      return { movieId, firstStart: sorted[0]?.starts_at || "", rows: sorted };
    })
    .sort((left, right) => left.firstStart.localeCompare(right.firstStart));
};

export const cinemaScreeningTags = (row: CityPosterCinemaRow) => {
  const tags: string[] = [];
  const format = String(row.format || "").trim();
  if (format && !/^standard$/i.test(format)) tags.push(format);
  const auditorium = String(row.auditorium || "").trim();
  if (auditorium && !/^standard$/i.test(auditorium)) tags.push(auditorium);
  const version = String(row.version_type || "").trim();
  if (version) tags.push(version);
  const audio = String(row.audio_language || "").trim();
  if (audio) tags.push(audio.toUpperCase());
  const subtitles = stringList(row.subtitle_languages);
  if (subtitles.length) tags.push(`${subtitles.map((item) => item.toUpperCase()).join("/")} SUB`);
  stringList(row.screening_tags).forEach((tag) => tags.push(tag));
  return [...new Set(tags)].slice(0, 3);
};

const safeHttpUrl = (value: string | null | undefined) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export const cinemaScreeningActionUrl = (row: CityPosterCinemaRow) =>
  safeHttpUrl(row.ticket_url) || safeHttpUrl(row.source_url);
