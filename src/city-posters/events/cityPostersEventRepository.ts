import { supabase } from "../../supabase";
import type { Language } from "../../types";
import type { CinemaPosterTimeFilter } from "../cinema/cinemaModel";

export type CityPostersEventCategory = "cinema" | "concerts" | "festivals" | "sport";

export type CityPostersEventRow = {
  event_id: string;
  occurrence_id: string;
  vertical: CityPostersEventCategory;
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
};

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

  const { data, error } = await supabase.rpc("city_posters_event_catalog", {
    p_city_id: normalizedCityId,
    p_vertical: category,
    p_language: language,
    p_time_filter: timeFilter,
    p_query: query.trim(),
    p_limit: 100,
  });

  if (error) throw new Error(`city_posters_event_catalog_failed:${error.code || "unknown"}`);
  return (Array.isArray(data) ? data : []) as CityPostersEventRow[];
}
