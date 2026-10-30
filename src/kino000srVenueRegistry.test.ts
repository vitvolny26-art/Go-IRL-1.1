import { describe, expect, it } from "vitest";
import {
  reconcileSrVerifiedVenueRegistry, requiredSrRegistrySourceIds,
} from "../api/_shared/cinema-sr-venue-registry";
import { selectSrSourceBindings } from "../api/_shared/cinema-sr-source-bindings";

const packageData = () => ({
  status: "SR_NINE_MOVIE_PACKAGE_PREPARED_NO_WRITE",
  write_authorized: false, publication_authorized: false, telegram_send_authorized: false,
  movies: [{ screenings: [
    { source_id: "cs_olomouc_premiere" }, { source_id: "cs_olomouc_cinestar" },
    { source_id: "cs_olomouc_premiere" },
  ] }],
});
const ids = ["cs_olomouc_cinestar", "cs_olomouc_premiere"];
const sources = () => selectSrSourceBindings(ids).map(binding => ({
  id: binding.registry_row_id, source_id: binding.registry_source_id,
  source_url: binding.registry_source_url, venue_id: binding.venue_id, timezone: "Europe/Prague", enabled: true,
}));
const venues = () => selectSrSourceBindings(ids).map(binding => ({
  id: binding.venue_id, source_id: binding.registry_source_id as string | null, city_id: "olomouc",
  name: "Verified Olomouc Cinema", slug: "olomouc-cinema", address: null,
  timezone: "Europe/Prague", active: true,
}));

describe("Kino000(SR) trusted source/venue readback", () => {
  it("extracts bounded exact source selectors and ignores duplicate screenings", () => {
    expect(requiredSrRegistrySourceIds(packageData())).toEqual(ids);
  });
  it("does not trust an upstream write flag", () => {
    expect(() => requiredSrRegistrySourceIds({ ...packageData(), write_authorized: true }))
      .toThrow("cinema_sr_registry_package_invalid");
  });
  it("does not trust malformed source identifiers", () => {
    const payload = packageData();
    payload.movies[0].screenings[0].source_id = "' OR true --";
    expect(() => requiredSrRegistrySourceIds(payload)).toThrow("cinema_sr_registry_source_id_invalid");
  });
  it("derives cinema key/name/timezone exclusively from verified DB rows", () => {
    const resolved = reconcileSrVerifiedVenueRegistry(ids, sources(), venues());
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toMatchObject({
      source_id: ids[0], cinema_key: "olomouc-cinema",
      cinema_name: "Verified Olomouc Cinema", venue_timezone: "Europe/Prague",
      verified_from_registry: true,
    });
  });
  it("rejects missing/disabled source rows", () => {
    expect(() => reconcileSrVerifiedVenueRegistry(ids, sources().slice(0, 1), venues()))
      .toThrow("cinema_sr_registry_sources_incomplete");
    const s = sources(); s[0].enabled = false;
    expect(() => reconcileSrVerifiedVenueRegistry(ids, s, venues()))
      .toThrow("cinema_sr_registry_source_invalid_or_disabled");
  });
  it("rejects another city's row for a shared chain source_id", () => {
    const s = sources(); s[0].id = "123e4567-e89b-42d3-a456-426614174999";
    expect(() => reconcileSrVerifiedVenueRegistry(ids, s, venues()))
      .toThrow("cinema_sr_registry_source_invalid_or_disabled");
  });
  it("rejects changed venue and URL behind a known source row", () => {
    const moved = sources(); moved[0].venue_id = moved[1].venue_id;
    expect(() => reconcileSrVerifiedVenueRegistry(ids, moved, venues())).toThrow();
    const url = sources(); url[0].source_url = "https://cinestar.cz/cz/praha/";
    expect(() => reconcileSrVerifiedVenueRegistry(ids, url, venues())).toThrow();
  });
  it("rejects mismatched city, timezone, inactive venue, and unexpected source link", () => {
    const wrongCity = venues(); wrongCity[0].city_id = "praha";
    expect(() => reconcileSrVerifiedVenueRegistry(ids, sources(), wrongCity))
      .toThrow("cinema_sr_registry_source_venue_unverified");
    const wrongZone = sources(); wrongZone[0].timezone = "UTC";
    expect(() => reconcileSrVerifiedVenueRegistry(ids, wrongZone, venues()))
      .toThrow("cinema_sr_registry_source_venue_unverified");
    const inactive = venues(); inactive[0].active = false;
    expect(() => reconcileSrVerifiedVenueRegistry(ids, sources(), inactive))
      .toThrow("cinema_sr_registry_source_venue_unverified");
    const mismatch = venues(); mismatch[0].source_id = "different_source";
    expect(() => reconcileSrVerifiedVenueRegistry(ids, sources(), mismatch))
      .toThrow("cinema_sr_registry_source_venue_unverified");
  });
});
