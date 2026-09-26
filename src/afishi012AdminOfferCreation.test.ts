import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const offers = readFileSync(resolve(process.cwd(), "src/offers/OffersCatalog.tsx"), "utf8");
const api = readFileSync(resolve(process.cwd(), "api/offers.ts"), "utf8");
const publisher = readFileSync(resolve(process.cwd(), "supabase/functions/telegramEventSupergroup/cityPostersPublication.ts"), "utf8");
const routing = readFileSync(resolve(process.cwd(), "api/_shared/telegram-city-publication-core.ts"), "utf8");
const edge = readFileSync(resolve(process.cwd(), "supabase/functions/telegramEventSupergroup/index.ts"), "utf8");
const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { rewrites: Array<{ source: string; destination: string }> };

describe("AFISHI012 admin offer creation", () => {
  it("adds persisted AFISHI012 offers without hiding legacy campaigns before their data migration", () => {
    expect(app).toContain("OffersCatalog");
    expect(app).toContain("<OffersCatalog language={language} cityId={selectedCityId} hasLegacyOffers={hasLegacyOffers} />");
    expect(offers).toContain('fetch("/api/meta/offers?city="');
    expect(offers).toContain('fetch("/api/admin/offers",');
    expect(vercel.rewrites).toContainEqual({ source: "/api/meta/offers", destination: "/api/offers" });
    expect(vercel.rewrites).toContainEqual({ source: "/api/admin/offers", destination: "/api/offers" });
    expect(api).toContain('.eq("status", "published")');
    expect(app).toContain("showCinemaCity25Offer");
    expect(app).toContain("{!isOffersDomain && (loading ? (");
    expect(offers).toContain("hasLegacyOffers");
    expect(api).toContain('metadata.created_via === "admin_offer_creation"');
  });

  it("shows Create only after the existing server-verified admin session and keeps server authorization", () => {
    expect(app).toContain("verifyCurrentAdminSession");
    expect(app).toContain("offersCreateEnabled");
    expect(app).not.toContain('const canCreateOffer = userRole === "admin" || userRole === "superadmin"');
    expect(app).toContain('window.dispatchEvent(new Event("go-irl:offers-create"))');
    expect(api).toContain("authorizeAdminRequest(request, productionAdminAuthorizationDependencies())");
    expect(api).not.toContain("VITE_");
  });

  it("persists canonical rows within the existing constraints and cleans partial creates by event cascade", () => {
    expect(api).toContain('.from("city_posters_events").insert');
    expect(api).toContain('.from("city_posters_event_translations").insert');
    expect(api).toContain('.from("city_posters_occurrences").insert');
    expect(api).toContain('.from("city_posters_offers").insert');
    const offerInsert = api.slice(api.indexOf('const offerInsert'), api.indexOf('if (offerInsert.error'));
    expect(offerInsert).toContain('occurrence_id: occurrenceId');
    expect(offerInsert).not.toContain('event_id: eventId');
    expect(api.indexOf('created.push(eventId)')).toBeLessThan(api.indexOf('const translationInsert'));
    expect(api).toContain('.from("city_posters_events").delete().eq("id", eventId)');
    expect(api).toContain('task: "AFISHI012"');
  });

  it("publishes through the existing tracked Telegram pipeline with city/topic fail-closed checks", () => {
    expect(api).toContain('action: "publish_city_poster_events"');
    expect(api).toContain('status === "published" ? "ready" : status');
    expect(api).toContain("resolveCityTelegramChatId");
    expect(api).toContain('error: "telegram_destination_unavailable"');
    expect(api).toContain("resolveCityTelegramPromotionsTopicId");
    expect(api).toContain('error: "telegram_topic_unavailable"');
    expect(offers).toContain('<option value="promotions">Promotions</option>');
    expect(publisher).toContain("telegram_text");
    expect(publisher).toContain('topicSetting==="promotions"');
    expect(routing).toContain("resolveCityTelegramTopicIdForKind");
  });

  it("uses each selected city's canonical timezone instead of browser or Prague time", () => {
    expect(api).toContain('cities as configuredCities');
    expect(api).toContain('zonedLocalDateTimeToUtc(startsAtLocal, city.timezone)');
    expect(api).toContain('timezone: city.timezone');
    expect(offers).toContain('startsAt: String(data.get("startsAt") || "")');
  });

  it("preserves a known draft start when the campaign end is still unknown", () => {
    expect(api).toContain('const hasStart = Boolean(startsAtParts)');
    expect(api).toContain('const hasEnd = Boolean(endsAtParts)');
    expect(api).toContain('error: "offer_period_start_required"');
    expect(api).toContain('error: "offer_period_invalid"');
    expect(api).toContain('const startsAt = hasStart ? zonedLocalDateTimeToUtc(startsAtLocal, city.timezone) : new Date()');
    expect(api).toContain('const endsAt = hasPeriod ? zonedLocalDateTimeToUtc(endsAtLocal, city.timezone) : null');
    expect(api).toContain('period_start_defined: hasStart');
    expect(api).toContain('if (status !== "draft" && !hasPeriod) return json(400, { error: "publication_period_required" })');
  });

  it("promotes the whole GO IRL campaign before downstream Telegram delivery", () => {
    expect(edge).toContain("const readyEventIds = eventIds.filter");
    expect(edge).toContain('.in("id", readyEventIds)');
    expect(edge.indexOf('const readyEventIds = eventIds.filter')).toBeLessThan(edge.indexOf('for (const eventId of eventIds)'));
    expect(api).toContain('warning = "telegram_publication_failed"');
    expect(offers).toContain('payload.warning === "telegram_publication_failed"');
  });

  it("keeps operator access governed instead of adding a hidden auth bypass", () => {
    expect(api).toContain('action: "city_posters.offer_created"');
    expect(api).not.toMatch(/backdoor|bypass|secret flag/i);
    expect(offers).toContain("getTrustedAccessToken");
    expect(offers).toContain("if (!telegramEdited) setTelegramDraft(value)");
    expect(offers).toContain("setTelegramEdited(true)");
  });
});
