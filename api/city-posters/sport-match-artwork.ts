import { createClient } from "@supabase/supabase-js";
import { readEnv } from "../_shared/env.js";
import {
  normalizeCityPostersSportType,
  renderCityPostersSportMatchArtworkJpeg,
  type CityPostersSportArtworkVariant,
} from "../_shared/city-posters-sport-match-artwork.js";
import {
  parseCityPostersSportTeams,
  resolveCityPostersSportTeamEmblem,
} from "../_shared/city-posters-sport-team-emblems.js";

type VercelRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  end(body?: string | Uint8Array): void;
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
};

const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).end("method_not_allowed");
  }

  const slug = firstQueryValue(request.query?.slug)?.trim();
  const variant = firstQueryValue(request.query?.variant) as CityPostersSportArtworkVariant | undefined;
  if (!slug || slug.length > 160 || !slugPattern.test(slug)
    || !variant || !["for-you", "catalog"].includes(variant)) {
    return response.status(404).end("not_found");
  }

  const url = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY") || readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) return response.status(503).end("render_unavailable");

  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const eventResult = await db
      .from("city_posters_events")
      .select("id,vertical,subcategory")
      .eq("canonical_slug", slug)
      .eq("status", "published")
      .maybeSingle();
    if (eventResult.error) throw eventResult.error;
    const event = eventResult.data;
    if (!event || event.vertical !== "sport") return response.status(404).end("not_found");

    const sportType = normalizeCityPostersSportType(event.subcategory || "");
    if (!sportType) return response.status(404).end("not_found");

    const translations = await db
      .from("city_posters_event_translations")
      .select("language,title")
      .eq("event_id", event.id)
      .in("language", ["cs", "en", "ru"]);
    if (translations.error) throw translations.error;
    const title = ["cs", "en", "ru"]
      .map((language) => translations.data?.find((item) => item.language === language)?.title)
      .find(Boolean);
    const teams = title ? parseCityPostersSportTeams(title) : null;
    if (!teams) return response.status(422).end("teams_unavailable");

    const jpeg = await renderCityPostersSportMatchArtworkJpeg({
      sportType,
      variant,
      homeTeamName: teams.homeTeamName,
      awayTeamName: teams.awayTeamName,
      homeLogoUrl: resolveCityPostersSportTeamEmblem(teams.homeTeamName),
      awayLogoUrl: resolveCityPostersSportTeamEmblem(teams.awayTeamName),
    });
    response.setHeader("Content-Type", "image/jpeg");
    response.setHeader("Content-Length", String(jpeg.length));
    response.setHeader("Cache-Control", "public, max-age=300");
    return response.status(200).end(jpeg);
  } catch {
    return response.status(503).end("render_unavailable");
  }
}
