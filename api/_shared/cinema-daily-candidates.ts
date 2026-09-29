export type CinemaDailyCandidateScreening = {
  movie_id: string;
  city_id: string;
  city_name: string;
  venue_id: string;
  cinema_name: string;
  title: string;
  local_date: string;
  format?: string | null;
  audio_type?: string | null;
  version_type?: string | null;
  screening_tags?: string[] | null;
  release_year?: number | null;
  imdb_rating?: number | null;
  imdb_votes?: number | null;
  active?: boolean;
};

export type CinemaCandidatePriority =
  | "ignore"
  | "store"
  | "interesting"
  | "moderation"
  | "high_priority";

export type CinemaDailyMovieCityCandidate = {
  movie_id: string;
  city_id: string;
  city_name: string;
  title: string;
  showing_from: string;
  showing_until: string;
  screening_count: number;
  day_count: number;
  cinemas: string[];
  venue_ids: string[];
  formats: string[];
  audio_types: string[];
  version_types: string[];
  score: number;
  priority: CinemaCandidatePriority;
  reasons: {
    has4k: boolean;
    hasDolby: boolean;
    has3d: boolean;
    hasDbox: boolean;
    hasOriginal: boolean;
    specialTitle: boolean;
    releaseYear: number | null;
    imdbRating: number | null;
    imdbVotes: number | null;
  };
};

const uniqueSorted = (values: Array<string | null | undefined>) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));

const priorityForScore = (score: number): CinemaCandidatePriority => {
  if (score >= 85) return "high_priority";
  if (score >= 70) return "moderation";
  if (score >= 60) return "interesting";
  if (score >= 40) return "store";
  return "ignore";
};

export const scoreCinemaMovieCityCandidate = (
  rows: CinemaDailyCandidateScreening[],
): { score: number; reasons: CinemaDailyMovieCityCandidate["reasons"] } => {
  if (!rows.length) throw new Error("cinema_candidate_rows_empty");

  const title = rows[0].title;
  const screeningCount = rows.length;
  const dayCount = new Set(rows.map((row) => row.local_date)).size;
  const has4k = rows.some((row) => row.format === "4K");
  const has3d = rows.some((row) => row.format === "3D");
  const hasDolby = rows.some((row) => (row.audio_type || "").toLowerCase().includes("dolby"));
  const hasDbox = rows.some((row) => (row.screening_tags || []).includes("D-BOX"));
  const hasOriginal = rows.some((row) => row.version_type === "original");
  const specialTitle = /(special edition|výročí|anniversary|premi[eé]ra|maraton)/i.test(title);
  const releaseYear = rows.map((row) => row.release_year ?? null).find((value) => value !== null) ?? null;
  const imdbRating = rows.map((row) => row.imdb_rating ?? null).find((value) => value !== null) ?? null;
  const imdbVotes = rows.map((row) => row.imdb_votes ?? null).find((value) => value !== null) ?? null;
  const showingYear = Number(rows.map((row) => row.local_date).sort()[0]?.slice(0, 4));

  let score = Math.min(screeningCount, 20) + Math.min(dayCount * 3, 18);
  if (has4k) score += 10;
  if (hasDolby) score += 8;
  if (has3d) score += 5;
  if (hasDbox) score += 4;
  if (hasOriginal) score += 4;
  if (specialTitle) score += 18;
  if (releaseYear !== null && Number.isFinite(showingYear) && releaseYear >= showingYear) score += 6;
  if (imdbRating !== null) {
    if (imdbRating >= 8) score += 25;
    else if (imdbRating >= 7) score += 18;
    else if (imdbRating >= 6.5) score += 10;
  }
  if (imdbVotes !== null) {
    if (imdbVotes >= 100_000) score += 15;
    else if (imdbVotes >= 20_000) score += 10;
    else if (imdbVotes >= 5_000) score += 5;
  }

  return {
    score,
    reasons: {
      has4k,
      hasDolby,
      has3d,
      hasDbox,
      hasOriginal,
      specialTitle,
      releaseYear,
      imdbRating,
      imdbVotes,
    },
  };
};

export const buildDailyMovieCityCandidates = (
  screenings: CinemaDailyCandidateScreening[],
): CinemaDailyMovieCityCandidate[] => {
  const groups = new Map<string, CinemaDailyCandidateScreening[]>();

  for (const row of screenings) {
    if (row.active === false) continue;
    if (!row.movie_id || !row.city_id || !row.local_date || !row.title) {
      throw new Error("cinema_candidate_identity_incomplete");
    }
    const key = `${row.movie_id}:${row.city_id}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const candidates = [...groups.values()].map((rows) => {
    const dates = rows.map((row) => row.local_date).sort();
    const { score, reasons } = scoreCinemaMovieCityCandidate(rows);
    return {
      movie_id: rows[0].movie_id,
      city_id: rows[0].city_id,
      city_name: rows[0].city_name,
      title: rows[0].title,
      showing_from: dates[0],
      showing_until: dates.at(-1) || dates[0],
      screening_count: rows.length,
      day_count: new Set(dates).size,
      cinemas: uniqueSorted(rows.map((row) => row.cinema_name)),
      venue_ids: uniqueSorted(rows.map((row) => row.venue_id)),
      formats: uniqueSorted(rows.map((row) => row.format)),
      audio_types: uniqueSorted(rows.map((row) => row.audio_type)),
      version_types: uniqueSorted(rows.map((row) => row.version_type)),
      score,
      priority: priorityForScore(score),
      reasons,
    } satisfies CinemaDailyMovieCityCandidate;
  });

  return candidates.sort((left, right) =>
    right.score - left.score
    || right.screening_count - left.screening_count
    || right.day_count - left.day_count
    || left.title.localeCompare(right.title)
    || left.city_id.localeCompare(right.city_id)
    || left.movie_id.localeCompare(right.movie_id)
  );
};
