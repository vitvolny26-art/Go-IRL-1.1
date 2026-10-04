import type { CinemaWeeklyWindowCandidate } from "./cinema-weekly-window.js";

export type CinemaWeeklyRankedCandidate = CinemaWeeklyWindowCandidate & {
  rank: number;
};

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

const compareCandidate = (
  left: CinemaWeeklyWindowCandidate,
  right: CinemaWeeklyWindowCandidate,
) =>
  right.score - left.score
  || compareText(left.showing_from, right.showing_from)
  || compareText(right.showing_until, left.showing_until)
  || compareText(left.id, right.id);

const validateCandidate = (candidate: CinemaWeeklyWindowCandidate) => {
  if (
    !candidate.id
    || !candidate.movie_id
    || !candidate.city_id
    || !candidate.title
    || !Number.isInteger(candidate.score)
    || candidate.score < 0
  ) {
    throw new Error("cinema_weekly_ranking_candidate_invalid");
  }
};

export const rankCinemaWeeklyCandidates = (
  candidates: CinemaWeeklyWindowCandidate[],
  topLimit = 10,
): CinemaWeeklyRankedCandidate[] => {
  if (!Number.isInteger(topLimit) || topLimit < 1 || topLimit > 10) {
    throw new Error("cinema_weekly_ranking_top_limit_invalid");
  }

  const bestByMovie = new Map<string, CinemaWeeklyWindowCandidate>();

  for (const candidate of candidates) {
    validateCandidate(candidate);
    const current = bestByMovie.get(candidate.movie_id);
    if (!current || compareCandidate(candidate, current) < 0) {
      bestByMovie.set(candidate.movie_id, candidate);
    }
  }

  return [...bestByMovie.values()]
    .sort(compareCandidate)
    .slice(0, topLimit)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
};
