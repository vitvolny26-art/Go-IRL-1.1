import { supabase } from "../../supabase";
import type { Language } from "../../types";
import type { CityPosterCinemaRow } from "./cinemaModel";

const maxRows = 800;

export async function loadCityPostersCinema(cityId: string, language: Language): Promise<CityPosterCinemaRow[]> {
  const normalizedCityId = cityId.trim();
  if (!normalizedCityId) return [];

  const { data, error } = await supabase.rpc("city_posters_cinema_catalog", {
    p_city_id: normalizedCityId,
    p_language: language,
    p_limit: maxRows,
  });
  if (error) throw new Error(`city_posters_cinema_load_failed:${error.code || "unknown"}`);
  return (Array.isArray(data) ? data : []) as CityPosterCinemaRow[];
}
