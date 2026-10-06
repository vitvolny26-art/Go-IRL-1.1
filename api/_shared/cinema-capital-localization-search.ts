export const CINEMA_CAPITAL_LOCALIZATION_TARGETS = [
  { locale: "ru", language: "Russian", capital: "Moscow", country: "RU" },
  { locale: "uk", language: "Ukrainian", capital: "Kyiv", country: "UA" },
  { locale: "cs", language: "Czech", capital: "Prague", country: "CZ" },
  { locale: "en", language: "English", capital: "London", country: "GB" },
  { locale: "pl", language: "Polish", capital: "Warsaw", country: "PL" },
  { locale: "sk", language: "Slovak", capital: "Bratislava", country: "SK" },
] as const;

export type CinemaCapitalLocalizationTarget = typeof CINEMA_CAPITAL_LOCALIZATION_TARGETS[number];
export type CinemaCapitalLocale = CinemaCapitalLocalizationTarget["locale"];
export type CinemaLocalizationSourceKind = "official_cinema" | "distributor" | "tmdb";

export type CinemaLocalizationCanonicalMovie = {
  id: string;
  title: string;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  imdb_id: string | null;
  external_ids: unknown;
};

export type CinemaLocalizationSearchCandidate = {
  provider_candidate_id: string;
  title: string | null;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  external_ids?: unknown;
  localized_title: string | null;
  synopsis: string | null;
  genres?: string[] | null;
  age_rating?: string | null;
  version_label?: string | null;
  source_url: string;
  source_name: string;
  source_kind: CinemaLocalizationSourceKind;
};

export type CinemaLocalizationMatchResult =
  | { status: "not_found"; candidate_ids: string[] }
  | { status: "mismatch"; candidate_ids: string[] }
  | { status: "ambiguous"; candidate_ids: string[] }
  | {
    status: "matched";
    candidate: CinemaLocalizationSearchCandidate;
    confidence: number;
    match_basis: "external_id" | "title_year" | "title_year_duration";
  };

const runtimeToleranceMinutes = 15;
const httpsUrl = /^https:\/\//i;

const normalizedTitle = (value: string | null | undefined) => (value || "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const text = (value: string | null | undefined) => {
  const output = String(value || "").trim();
  return output || null;
};

const idObject = (value: unknown) => (
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const canonicalExternalIds = (movie: CinemaLocalizationCanonicalMovie) => {
  const external = idObject(movie.external_ids);
  const imdb = text(movie.imdb_id) || text(external.imdb as string | null | undefined);
  const tmdb = text(String(external.tmdb ?? ""));
  return { imdb, tmdb };
};

const candidateExternalIds = (candidate: CinemaLocalizationSearchCandidate) => {
  const external = idObject(candidate.external_ids);
  return {
    imdb: text(external.imdb as string | null | undefined),
    tmdb: text(String(external.tmdb ?? "")),
  };
};

const externalIdentity = (
  movie: CinemaLocalizationCanonicalMovie,
  candidate: CinemaLocalizationSearchCandidate,
) => {
  const expected = canonicalExternalIds(movie);
  const actual = candidateExternalIds(candidate);
  let exact = false;
  let conflict = false;

  for (const key of ["imdb", "tmdb"] as const) {
    if (!expected[key] || !actual[key]) continue;
    if (expected[key] === actual[key]) exact = true;
    else conflict = true;
  }

  return { exact: exact && !conflict, conflict };
};

const titleIdentityMatches = (
  movie: CinemaLocalizationCanonicalMovie,
  candidate: CinemaLocalizationSearchCandidate,
) => {
  const expected = new Set([movie.title, movie.original_title].map(normalizedTitle).filter(Boolean));
  return [candidate.title, candidate.original_title]
    .map(normalizedTitle)
    .some((value) => value && expected.has(value));
};

const sortedIds = (candidates: CinemaLocalizationSearchCandidate[]) =>
  candidates.map((candidate) => candidate.provider_candidate_id).sort();

const localizationPayloadSignature = (candidate: CinemaLocalizationSearchCandidate) => JSON.stringify({
  localized_title: normalizedTitle(candidate.localized_title),
  synopsis: text(candidate.synopsis),
  genres: (candidate.genres || []).map(normalizedTitle).sort(),
  age_rating: text(candidate.age_rating),
  version_label: text(candidate.version_label),
});

const sourceRank: Record<CinemaLocalizationSourceKind, number> = {
  official_cinema: 0,
  distributor: 1,
  tmdb: 2,
};

const deterministicCandidate = (candidates: CinemaLocalizationSearchCandidate[]) => [...candidates].sort((a, b) =>
  sourceRank[a.source_kind] - sourceRank[b.source_kind]
  || a.source_url.localeCompare(b.source_url)
  || a.provider_candidate_id.localeCompare(b.provider_candidate_id))[0];

const collapseEquivalentCanonicalMatches = (candidates: CinemaLocalizationSearchCandidate[]) => {
  if (candidates.length < 2) return candidates;
  const signatures = new Set(candidates.map(localizationPayloadSignature));
  return signatures.size === 1 ? [deterministicCandidate(candidates)] : candidates;
};

const collapseEquivalentProviderDuplicates = (candidates: CinemaLocalizationSearchCandidate[]) => {
  const groups = new Map<string, CinemaLocalizationSearchCandidate[]>();
  for (const candidate of candidates) {
    const ids = candidateExternalIds(candidate);
    const identity = ids.imdb ? `imdb:${ids.imdb}` : ids.tmdb ? `tmdb:${ids.tmdb}` : `provider:${candidate.provider_candidate_id}`;
    groups.set(identity, [...(groups.get(identity) || []), candidate]);
  }
  return [...groups.values()].flatMap((group) => collapseEquivalentCanonicalMatches(group));
};

const validateCandidate = (candidate: CinemaLocalizationSearchCandidate) => {
  if (
    !text(candidate.provider_candidate_id)
    || !text(candidate.source_name)
    || !httpsUrl.test(candidate.source_url)
    || !["official_cinema", "distributor", "tmdb"].includes(candidate.source_kind)
  ) throw new Error("cinema_capital_localization_candidate_invalid");
};

export const selectCinemaCapitalLocalizationCandidate = (
  movie: CinemaLocalizationCanonicalMovie,
  candidates: CinemaLocalizationSearchCandidate[],
): CinemaLocalizationMatchResult => {
  if (!movie.id || !text(movie.title)) throw new Error("cinema_capital_localization_movie_invalid");

  candidates.forEach(validateCandidate);

  const externalMatches = collapseEquivalentCanonicalMatches(candidates.filter((candidate) => externalIdentity(movie, candidate).exact));
  if (externalMatches.length > 1) {
    return { status: "ambiguous", candidate_ids: sortedIds(externalMatches) };
  }
  if (externalMatches.length === 1) {
    const candidate = externalMatches[0];
    return {
      status: "matched",
      candidate,
      confidence: 1,
      match_basis: "external_id",
    };
  }

  const titleMatches = candidates.filter((candidate) =>
    !externalIdentity(movie, candidate).conflict && titleIdentityMatches(movie, candidate));

  const compatible = collapseEquivalentProviderDuplicates(titleMatches.filter((candidate) => {
    if (movie.release_year == null || candidate.release_year == null) return false;
    if (movie.release_year !== candidate.release_year) return false;

    if (
      movie.duration_minutes != null
      && candidate.duration_minutes != null
      && Math.abs(movie.duration_minutes - candidate.duration_minutes) > runtimeToleranceMinutes
    ) return false;

    return true;
  }));

  if (!compatible.length) {
    return titleMatches.length
      ? { status: "mismatch", candidate_ids: sortedIds(titleMatches) }
      : { status: "not_found", candidate_ids: [] };
  }
  if (compatible.length > 1) {
    return { status: "ambiguous", candidate_ids: sortedIds(compatible) };
  }

  const candidate = compatible[0];
  const durationMatched = movie.duration_minutes != null
    && candidate.duration_minutes != null
    && Math.abs(movie.duration_minutes - candidate.duration_minutes) <= runtimeToleranceMinutes;

  return {
    status: "matched",
    candidate,
    confidence: durationMatched ? 0.9 : 0.8,
    match_basis: durationMatched ? "title_year_duration" : "title_year",
  };
};

export const buildCinemaCapitalLocalizationSearchRow = (options: {
  weeklySelectionId: string;
  candidateId: string;
  movieId: string;
  target: CinemaCapitalLocalizationTarget;
  result: CinemaLocalizationMatchResult | { status: "provider_error"; candidate_ids?: string[] };
}) => {
  const { weeklySelectionId, candidateId, movieId, target, result } = options;
  if (!weeklySelectionId || !candidateId || !movieId) {
    throw new Error("cinema_capital_localization_identity_invalid");
  }

  if (result.status !== "matched") {
    return {
      weekly_selection_id: weeklySelectionId,
      candidate_id: candidateId,
      movie_id: movieId,
      locale: target.locale,
      capital: target.capital,
      country_code: target.country,
      status: result.status,
      localized_title: null,
      synopsis: null,
      genres: [],
      age_rating: null,
      version_label: null,
      source_url: null,
      source_name: null,
      source_kind: null,
      confidence: null,
      match_basis: null,
      metadata: { candidate_ids: result.candidate_ids || [] },
    };
  }

  const candidate = result.candidate;
  if (!text(candidate.localized_title) && !text(candidate.synopsis)) {
    throw new Error("cinema_capital_localization_payload_empty");
  }

  return {
    weekly_selection_id: weeklySelectionId,
    candidate_id: candidateId,
    movie_id: movieId,
    locale: target.locale,
    capital: target.capital,
    country_code: target.country,
    status: "matched",
    localized_title: text(candidate.localized_title),
    synopsis: text(candidate.synopsis),
    genres: Array.isArray(candidate.genres)
      ? candidate.genres.map((value) => text(value)).filter((value): value is string => Boolean(value))
      : [],
    age_rating: text(candidate.age_rating),
    version_label: text(candidate.version_label),
    source_url: candidate.source_url,
    source_name: candidate.source_name.trim(),
    source_kind: candidate.source_kind,
    confidence: result.confidence,
    match_basis: result.match_basis,
    metadata: { provider_candidate_id: candidate.provider_candidate_id },
  };
};
