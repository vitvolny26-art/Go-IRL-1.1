import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration=readFileSync(new URL("../supabase/migrations/20260918193000_akce001b_city_posters_planned.sql",import.meta.url),"utf8");
const planned=readFileSync(new URL("./city-posters/cityPostersPlanned.ts",import.meta.url),"utf8");
const page=readFileSync(new URL("./city-posters/CityPostersPage.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
describe("Akce001B City Posters Planned contract",()=>{
 it("stores user intent against canonical City Posters Event identity with owner RLS",()=>{
  expect(migration).toContain("create table if not exists public.city_posters_user_plans");
  expect(migration).toContain("primary key (user_key, event_id)");
  expect(migration).toContain("go_irl_auth_user_key()");
  expect(migration).not.toContain("activity_members");
 });
 it("exposes authenticated idempotent plan RPCs and only upcoming published events",()=>{
  expect(migration).toContain("go_irl_set_my_city_posters_plan_by_slug");
  expect(migration).toContain("on conflict (user_key, event_id) do update");
  expect(migration).toContain("event.status = 'published'");
  expect(migration).toContain("coalesce(occurrence.ends_at, occurrence.starts_at + interval '3 hours') >= now()");
 });
 it("projects canonical plans into the existing City Posters Planned tab",()=>{
  expect(planned).toContain("go_irl_list_my_city_posters_plans");
  expect(page).toContain("<CityPostersPlanned cityId={selectedCityId} language={language} />");
 });
 it("connects the CineStar Want to go action by canonical slug without Activity membership",()=>{
  expect(app).toContain('canonicalSlug: "cinestar-kino-days-2026-olomouc"');
  expect(app).toContain('canonicalSlug: "cinestar-kino-days-2026-praha"');
  expect(app).toContain('canonicalSlug: "cinestar-kino-days-2026-ostrava"');
  expect(app).toContain("cineStarKinoDaysOffer?.canonicalSlug");
  expect(app).toContain("planCityPostersEventBySlug");
  expect(app).toContain("wantToGo");
 });
});
