import { initializeTrustedAuth } from "../authSession";
import { supabase } from "../supabase";
import type { Language } from "../types";

type CityPostersPlannedRow = {
  event_id?: unknown; canonical_slug?: unknown; vertical?: unknown; title?: unknown; description?: unknown;
  starts_at?: unknown; ends_at?: unknown; timezone?: unknown; hero_media_url?: unknown;
  organizer_name?: unknown; occurrence_url?: unknown; saved_at?: unknown;
};

export type CityPostersPlannedItem = {
  eventId: string; canonicalSlug: string; vertical: string; title: string; description: string;
  startsAt: string; endsAt: string | null; timezone: string; heroMediaUrl: string | null;
  organizerName: string | null; occurrenceUrl: string | null; savedAt: string;
};

const trusted = (identity: { source?: string } | null) =>
  identity?.source === "trusted-telegram" || identity?.source === "trusted-provider";

export async function loadCityPostersPlanned(cityId: string, language: Language): Promise<CityPostersPlannedItem[]> {
  const identity = await initializeTrustedAuth();
  if (!trusted(identity)) return [];
  const { data, error } = await supabase.rpc("go_irl_list_my_city_posters_plans", { p_city_id: cityId.trim(), p_language: language });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row: CityPostersPlannedRow) => ({
    eventId: String(row.event_id), canonicalSlug: String(row.canonical_slug), vertical: String(row.vertical),
    title: String(row.title), description: String(row.description || ""), startsAt: String(row.starts_at),
    endsAt: row.ends_at ? String(row.ends_at) : null, timezone: String(row.timezone || "Europe/Prague"),
    heroMediaUrl: row.hero_media_url ? String(row.hero_media_url) : null,
    organizerName: row.organizer_name ? String(row.organizer_name) : null,
    occurrenceUrl: row.occurrence_url ? String(row.occurrence_url) : null, savedAt: String(row.saved_at),
  }));
}

export async function planCityPostersEventBySlug(cityId: string, canonicalSlug: string) {
  const identity = await initializeTrustedAuth();
  if (!trusted(identity)) throw new Error("trusted_auth_required");
  const { data, error } = await supabase.rpc("go_irl_set_my_city_posters_plan_by_slug", {
    p_city_id: cityId.trim(), p_canonical_slug: canonicalSlug.trim(),
  });
  if (error) throw error;
  return String(data || "");
}

export async function removeCityPostersPlan(eventId: string) {
  const identity = await initializeTrustedAuth();
  if (!trusted(identity)) throw new Error("trusted_auth_required");
  const { error } = await supabase.rpc("go_irl_remove_my_city_posters_plan", { p_event_id: eventId });
  if (error) throw error;
}
