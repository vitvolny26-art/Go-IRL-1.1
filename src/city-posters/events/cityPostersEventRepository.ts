import { cities } from "../../config/cities";
import { supabase } from "../../supabase";
import type { Language } from "../../types";
import type { CinemaPosterTimeFilter } from "../cinema/cinemaModel";
import { normalizeCityPostersMediaUrl } from "../cityPostersMedia";

export type CityPostersEventVertical =
  | "cinema"
  | "concerts"
  | "festivals"
  | "sport"
  | "theatre"
  | "comedy"
  | "exhibitions"
  | "family"
  | "education"
  | "nightlife"
  | "city_special"
  | "other";

export type CityPostersEventCategory = CityPostersEventVertical | "all";

export type CityPostersEventRow = {
  event_id: string;
  occurrence_id: string;
  city_id?: string;
  vertical: CityPostersEventVertical;
  subcategory?: string | null;
  canonical_slug: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  venue_name: string | null;
  venue_address: string | null;
  hero_media_url: string | null;
  organizer_name: string | null;
  occurrence_url: string | null;
  all_day?: boolean;
};

const catalogVerticals: CityPostersEventVertical[] = [
  "cinema", "concerts", "festivals", "sport", "theatre", "comedy",
  "exhibitions", "family", "education", "nightlife", "city_special", "other",
];

async function loadVertical({
  cityId,
  vertical,
  language,
  timeFilter,
  query,
}: {
  cityId: string;
  vertical: CityPostersEventVertical;
  language: Language;
  timeFilter: CinemaPosterTimeFilter;
  query: string;
}) {
  const { data, error } = await supabase.rpc("city_posters_event_catalog", {
    p_city_id: cityId,
    p_vertical: vertical,
    p_language: language,
    p_time_filter: timeFilter,
    p_query: query,
    p_limit: 100,
  });
  if (error) throw new Error(`city_posters_event_catalog_failed:${error.code || "unknown"}`);
  return (Array.isArray(data) ? data : []).map((row) => ({
    ...(row as CityPostersEventRow), hero_media_url: normalizeCityPostersMediaUrl((row as CityPostersEventRow).hero_media_url),
  }));
}

export async function loadCityPostersEvents({
  cityId,
  category,
  language,
  timeFilter,
  query,
}: {
  cityId: string;
  category: CityPostersEventCategory;
  language: Language;
  timeFilter: CinemaPosterTimeFilter;
  query: string;
}): Promise<CityPostersEventRow[]> {
  const normalizedCityId = cityId.trim();
  if (!normalizedCityId) return [];
  const normalizedQuery = query.trim();
  const verticals = category === "all" ? catalogVerticals : [category];
  const resultSets = await Promise.all(verticals.map((vertical) => loadVertical({
    cityId: normalizedCityId,
    vertical,
    language,
    timeFilter,
    query: normalizedQuery,
  })));
  const byOccurrence = new Map<string, CityPostersEventRow>();
  for (const row of resultSets.flat()) byOccurrence.set(row.occurrence_id, { ...row, city_id: normalizedCityId });
  return [...byOccurrence.values()].sort((left, right) =>
    left.starts_at.localeCompare(right.starts_at) || left.title.localeCompare(right.title),
  );
}

export async function loadCityPostersEventBySlug(
  canonicalSlug: string,
  language: Language,
): Promise<CityPostersEventRow | null> {
  const slug = canonicalSlug.trim();
  if (!slug) return null;

  const exact = await supabase.rpc("city_posters_event_by_slug", {
    p_canonical_slug: slug,
    p_language: language,
  });
  if (!exact.error) {
    const rows = Array.isArray(exact.data) ? exact.data : [];
    const row = rows[0] as CityPostersEventRow | undefined;
    return row ? { ...row, hero_media_url: normalizeCityPostersMediaUrl(row.hero_media_url) } : null;
  }

  const city = cities.find((candidate) => slug.endsWith(`-${candidate.id}`));
  if (!city) throw new Error(`city_posters_event_by_slug_failed:${exact.error.code || "unknown"}`);
  const fallback = await loadCityPostersEvents({
    cityId: city.id,
    category: "all",
    language,
    timeFilter: "tomorrow",
    query: "",
  });
  return fallback.find((row) => row.canonical_slug === slug) || null;
}
