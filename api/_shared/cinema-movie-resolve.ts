export type CinemaMovieResolveCandidate = {
  id: string;
  title: string;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
};

export type CinemaMovieResolveInput = {
  title: string;
  originalTitle: string | null;
  releaseYear: number | null;
  durationMinutes: number | null;
};

export type CinemaMovieResolveDecision =
  | { status: "matched"; movieId: string; candidateCount: 1 }
  | { status: "ambiguous"; candidateCount: number }
  | { status: "new"; candidateCount: 0 };

const removableSuffix = /\s+(dabing|dab|dub|dubbing|titulky|tit|sub|subtitles|orig|original|cz|cs|2d|3d|4k)(\s*\([^)]*\))?\s*$/giu;

export const canonicalCinemaMovieMatchKey = (value: string | null | undefined) => {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("und")
    .replace(removableSuffix, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
};

const titleKeys = (title: string | null, originalTitle: string | null) =>
  new Set(
    [canonicalCinemaMovieMatchKey(title), canonicalCinemaMovieMatchKey(originalTitle)]
      .filter(Boolean),
  );

const yearCompatible = (input: CinemaMovieResolveInput, candidate: CinemaMovieResolveCandidate) => {
  if (input.releaseYear == null || candidate.release_year == null) return true;
  return candidate.release_year === input.releaseYear;
};

const durationCompatible = (input: CinemaMovieResolveInput, candidate: CinemaMovieResolveCandidate) => {
  if (input.releaseYear != null) {
    if (input.durationMinutes == null || candidate.duration_minutes == null) return true;
    return Math.abs(input.durationMinutes - candidate.duration_minutes) <= 15;
  }
  if (input.durationMinutes == null || candidate.duration_minutes == null) return false;
  return Math.abs(input.durationMinutes - candidate.duration_minutes) <= 5;
};

export const selectCanonicalMovieMatch = (
  input: CinemaMovieResolveInput,
  candidates: CinemaMovieResolveCandidate[],
): CinemaMovieResolveDecision => {
  const expected = titleKeys(input.title, input.originalTitle);
  if (!expected.size) return { status: "new", candidateCount: 0 };

  const matches = candidates.filter((candidate) => {
    const candidateKeys = titleKeys(candidate.title, candidate.original_title);
    const exactTitleIdentity = [...candidateKeys].some((key) => expected.has(key));
    return exactTitleIdentity && yearCompatible(input, candidate) && durationCompatible(input, candidate);
  });

  if (matches.length === 1) return { status: "matched", movieId: matches[0].id, candidateCount: 1 };
  if (matches.length > 1) return { status: "ambiguous", candidateCount: matches.length };
  return { status: "new", candidateCount: 0 };
};
