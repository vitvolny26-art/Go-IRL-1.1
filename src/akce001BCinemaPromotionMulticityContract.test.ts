import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260920023000_akce001b_cinestar_multicity_promotions.sql", import.meta.url),"utf8");
const sources = readFileSync(new URL("../supabase/migrations/20260920023100_akce001b_cinestar_supported_city_sources.sql", import.meta.url),"utf8");

describe("Akce001B CineStar multi-city promotion contract", () => {
  it("keys canonical promotion by source campaign plus city, not source_config_id or venue", () => {
    expect(migration).toContain("v_source.source_id || ':' || v_promo.promotion_key || ':' || v_venue.city_id");
    expect(migration).not.toContain("md5(v_approval.source_config_id::text || ':' || v_promo.promotion_key)");
  });
  it("converges multiple venues in one city on one canonical event", () => {
    expect(migration).toContain("on conflict (city_id, canonical_slug) do update");
    expect(migration).toContain("'cityId',v_venue.city_id");
  });
  it("keeps venue-specific official offers under shared city campaign", () => {
    expect(migration).toContain("offer.metadata->>'venueId'=v_venue.id::text");
    expect(migration).toContain("'venueId',v_venue.id");
  });
});

describe("Akce001B CineStar supported city source declaration", () => {
  it("declares Praha Andel, Praha Cerny Most and Ostrava without inventing Brno CineStar", () => {
    expect(sources).toContain("'praha-andel-cinestar'");
    expect(sources).toContain("'praha-cerny-most-cinestar'");
    expect(sources).toContain("'ostrava-cinestar'");
    expect(sources).not.toContain("brno-cinestar");
  });
  it("keeps newly declared CineStar sources disabled pending separate production activation", () => {
    expect(sources).toContain("v.timezone,false,1440");
    expect(sources).toContain("enabled=public.cinema_sources.enabled");
    expect(sources).not.toContain("cinema_publication_approval_sources");
  });
});
