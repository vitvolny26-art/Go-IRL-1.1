/** Kino000(SR): trusted, read-only venue/source registry reconciliation. No writes. */
import type { SrVerifiedVenue } from "./cinema-sr-catalog-staging-plan.js";
import { selectSrSourceBindings } from "./cinema-sr-source-bindings.js";

export type SrSourceRegistryRow = {
  id: string;
  source_id: string;
  source_url: string;
  venue_id: string;
  timezone: string;
  enabled: boolean;
};
export type SrVenueRegistryRow = {
  id: string;
  source_id: string | null;
  city_id: string;
  name: string;
  slug: string;
  address: string | null;
  timezone: string;
  active: boolean;
};

const safeId = (value: unknown) => typeof value === "string" && /^[a-z0-9_-]{1,100}$/.test(value);
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value === value.trim();
const zoneValid = (value: unknown) => {
  if (typeof value !== "string" || !nonempty(value)) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date()); return true; }
  catch { return false; }
};

/** Accept source IDs from the untrusted package only as a bounded READ selector. */
export function requiredSrRegistrySourceIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Error("cinema_sr_registry_package_invalid");
  }
  const p = payload as Record<string, unknown>;
  if (p.status !== "SR_NINE_MOVIE_PACKAGE_PREPARED_NO_WRITE" ||
      p.write_authorized !== false || p.publication_authorized !== false ||
      p.telegram_send_authorized !== false || !Array.isArray(p.movies) ||
      !p.movies.length || p.movies.length > 10) {
    throw Error("cinema_sr_registry_package_invalid");
  }
  const ids = new Set<string>();
  for (const raw of p.movies) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.screenings) ||
        !raw.screenings.length || raw.screenings.length > 1000) {
      throw Error("cinema_sr_registry_screening_invalid");
    }
    for (const row of raw.screenings) {
      if (!safeId(row?.source_id)) throw Error("cinema_sr_registry_source_id_invalid");
      ids.add(row.source_id);
      if (ids.size > 32) throw Error("cinema_sr_registry_source_limit_exceeded");
    }
  }
  return [...ids].sort();
}

/** All matching records must come from live DB queries performed by the server. */
export function reconcileSrVerifiedVenueRegistry(
  required: readonly string[],
  sources: readonly SrSourceRegistryRow[],
  venues: readonly SrVenueRegistryRow[],
): SrVerifiedVenue[] {
  if (!required.length || required.length > 32 || new Set(required).size !== required.length ||
      required.some(id => !safeId(id))) throw Error("cinema_sr_registry_required_sources_invalid");
  if (sources.length !== required.length) throw Error("cinema_sr_registry_sources_incomplete");
  const bindings = selectSrSourceBindings(required);
  const bySource = new Map<string, SrSourceRegistryRow>();
  for (const source of sources) {
    const binding = bindings.find(row => row.registry_row_id === source.id);
    if (!binding || bySource.has(binding.sr_source_id) ||
        source.source_id !== binding.registry_source_id || source.venue_id !== binding.venue_id ||
        source.source_url !== binding.registry_source_url ||
        !uuid(source.venue_id) || !zoneValid(source.timezone) || source.enabled !== true) {
      throw Error("cinema_sr_registry_source_invalid_or_disabled");
    }
    bySource.set(binding.sr_source_id, source);
  }
  const byVenue = new Map<string, SrVenueRegistryRow>();
  for (const venue of venues) {
    if (!uuid(venue.id) || byVenue.has(venue.id)) throw Error("cinema_sr_registry_venue_duplicate_or_invalid");
    byVenue.set(venue.id, venue);
  }
  const verified: SrVerifiedVenue[] = [];
  for (const id of required) {
    const s = bySource.get(id);
    const v = s ? byVenue.get(s.venue_id) : null;
    if (!s || !v || v.city_id !== "olomouc" || v.active !== true ||
        !nonempty(v.name) || !safeId(v.slug) || !zoneValid(v.timezone) ||
        s.timezone !== v.timezone || (v.source_id !== null && v.source_id !== s.source_id)) {
      throw Error(`cinema_sr_registry_source_venue_unverified:${id}`);
    }
    if (v.address !== null && typeof v.address !== "string") {
      throw Error("cinema_sr_registry_address_invalid");
    }
    verified.push({
      source_id: id, cinema_key: v.slug, cinema_name: v.name,
      cinema_address: v.address?.trim() || null,
      venue_timezone: v.timezone, verified_from_registry: true,
    });
  }
  return verified;
}
