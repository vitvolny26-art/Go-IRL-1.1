import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration=readFileSync(new URL("../supabase/migrations/20260918193000_akce001b_city_posters_planned.sql",import.meta.url),"utf8");
const planned=readFileSync(new URL("./city-posters/cityPostersPlanned.ts",import.meta.url),"utf8");
const media=readFileSync(new URL("./city-posters/cityPostersMedia.ts",import.meta.url),"utf8");
const eventRepository=readFileSync(new URL("./city-posters/events/cityPostersEventRepository.ts",import.meta.url),"utf8");
const plannedView=readFileSync(new URL("./city-posters/CityPostersPlanned.tsx",import.meta.url),"utf8");
const page=readFileSync(new URL("./city-posters/CityPostersPage.tsx",import.meta.url),"utf8");
const appEntry=readFileSync(new URL("./app-entry.ts",import.meta.url),"utf8");
const entry=readFileSync(new URL("./city-posters/entry.tsx",import.meta.url),"utf8");
const cityStyles=readFileSync(new URL("./city-posters/city-posters.css",import.meta.url),"utf8");
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
 it("uses same-origin paths for canonical GO IRL artwork in web projections",()=>{
  expect(media).toContain('new Set(["https://go-irl.fun", "https://go-irl-1-1.vercel.app"])');
  expect(media).toContain('url.pathname.startsWith("/afishi/")');
  expect(media).toContain('return `${url.pathname}${url.search}${url.hash}`;');
  expect(planned).toContain("heroMediaUrl: normalizeCityPostersMediaUrl(row.hero_media_url)");
  expect(eventRepository).toContain("hero_media_url: normalizeCityPostersMediaUrl");
 });
 it("loads the Planned visual layer at the City Posters entry and suppresses native WebView controls",()=>{
  expect(appEntry).toContain('import "./city-posters/city-posters.css";');
  expect(entry).not.toContain('import "./city-posters.css";');
  expect(page).not.toContain('import "./city-posters.css";');
  expect(plannedView).toContain('className="city-posters-planned-actions"');
  expect(cityStyles).toContain(".city-posters-planned-actions > a,.city-posters-planned-actions > button");
  expect(cityStyles).toContain("appearance:none;");
  expect(cityStyles).toContain("-webkit-appearance:none;");
  expect(cityStyles).toContain("text-decoration:none;");
  expect(cityStyles).toContain("color:var(--text);");
  expect(cityStyles).not.toContain("grid-template-columns:96px minmax(0,1fr)");
  expect(cityStyles).toContain("aspect-ratio:1 / 1;");
  expect(cityStyles).toContain("position:absolute; inset:0; z-index:0;");
  expect(cityStyles).toContain("object-fit:cover; object-position:center;");
  expect(cityStyles).toContain("position:relative; z-index:2; display:flex; flex-direction:column;");
  expect(cityStyles).toContain("grid-template-columns:repeat(2,minmax(0,1fr));");
  expect(cityStyles).toContain("grid-template-columns:repeat(3,minmax(0,1fr));");
  expect(cityStyles).not.toContain("object-fit:contain;");
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
