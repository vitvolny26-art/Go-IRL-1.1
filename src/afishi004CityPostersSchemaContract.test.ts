/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260914140000_afishi004_city_posters_schema_contract.sql", import.meta.url),
  "utf8",
);

const verification = readFileSync(
  new URL("../supabase/verify_afishi004_city_posters_schema_contract.sql", import.meta.url),
  "utf8",
);

const architecture = readFileSync(
  new URL("../docs/architecture/CITY_POSTERS_DATA_MODEL.md", import.meta.url),
  "utf8",
);

const cinemaCatalogMigration = readFileSync(
  new URL("../supabase/migrations/20260914130000_city_posters_cinema_public_catalog.sql", import.meta.url),
  "utf8",
);

describe("AFISHI004 City Posters schema contract", () => {
  it("keeps Event identity separate from Occurrence schedule and supports six first-class languages", () => {
    expect(migration).toContain("create table if not exists public.city_posters_events");
    expect(migration).toContain("create table if not exists public.city_posters_occurrences");
    expect(migration).toContain("create table if not exists public.city_posters_event_translations");
    expect(migration).toContain("language in ('ru','uk','cs','en','pl','sk')");
    expect(migration).toContain("starts_at timestamptz not null");
    expect(migration).toContain("timezone text not null");
  });

  it("models reusable venues, source provenance and event-or-occurrence CTA offers", () => {
    expect(migration).toContain("create table if not exists public.city_posters_venues");
    expect(migration).toContain("create table if not exists public.city_posters_sources");
    expect(migration).toContain("create table if not exists public.city_posters_source_records");
    expect(migration).toContain("create table if not exists public.city_posters_offers");
    expect(migration).toContain("match_status in ('unmatched','matched','ambiguous','rejected')");
    expect(migration).toContain("check ((event_id is not null)::integer + (occurrence_id is not null)::integer = 1)");
  });

  it("keeps browser writes denied and provenance staff-only while service_role owns ingestion writes", () => {
    expect(migration).toContain("revoke all on table public.city_posters_events from public, anon, authenticated");
    expect(migration).toContain("grant select on table public.city_posters_events to authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.city_posters_events to service_role");
    expect(migration).toContain("city posters source records staff read");
    expect(migration).toContain("private.go_irl_request_can_moderate()");
    expect(migration).not.toContain("grant insert on table public.city_posters_events to authenticated");
    expect(migration).not.toContain("grant update on table public.city_posters_events to authenticated");
    expect(migration).not.toContain("grant delete on table public.city_posters_events to authenticated");
  });

  it("does not mutate Activity or cinema vertical tables", () => {
    expect(migration).not.toMatch(/alter table public\.activities/i);
    expect(migration).not.toMatch(/alter table public\.cinema_/i);
    expect(migration).not.toMatch(/drop table (?:if exists )?public\.activities/i);
    expect(migration).not.toMatch(/drop table (?:if exists )?public\.cinema_/i);
  });

  it("coexists with the main@3361660 Cinema read projection without turning it into canonical storage", () => {
    expect(cinemaCatalogMigration).toContain("create or replace function public.city_posters_cinema_catalog(");
    expect(cinemaCatalogMigration).toContain("from public.cinema_screenings s");
    expect(cinemaCatalogMigration).toContain("grant execute on function public.city_posters_cinema_catalog(text, integer) to anon, authenticated, service_role");
    expect(architecture).toContain("main@3361660");
    expect(architecture).toContain("public.city_posters_cinema_catalog(text, integer)");
    expect(architecture).toContain("generic canonical tables do not replace the existing cinema read projection");
  });

  it("ships a rollback-only verifier and an explicit no-production-apply plan", () => {
    expect(verification.trimEnd()).toMatch(/rollback;$/);
    expect(verification).toContain("authenticated direct mutation privilege leak");
    expect(verification).toContain("provenance staff-only RLS missing");
    expect(architecture).toContain("Production apply is NOT part of AFISHI004");
    expect(architecture).toContain("Rollback plan");
    expect(architecture).toContain("Do not blindly drop tables after consumers or production data exist");
  });
});
