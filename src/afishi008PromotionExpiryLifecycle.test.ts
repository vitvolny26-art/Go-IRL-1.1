import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cityPostersPromotionExpiryMs, isCityPostersPromotionActive } from "./city-posters/cityPostersPromotionLifecycle";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const maintenance = readFileSync(new URL("../api/city-posters/maintenance.ts", import.meta.url), "utf8");

describe("AFISHI008 universal promotion expiry lifecycle", () => {
  it("uses canonical occurrence ends_at for every promotion", () => {
    const event = { starts_at: "2026-09-19T00:00:00Z", ends_at: "2026-09-21T00:00:00Z" };
    expect(cityPostersPromotionExpiryMs(event)).toBe(Date.parse(event.ends_at));
    expect(isCityPostersPromotionActive(event, Date.parse("2026-09-20T23:59:59Z"))).toBe(true);
    expect(isCityPostersPromotionActive(event, Date.parse("2026-09-21T00:00:00Z"))).toBe(false);
    expect(isCityPostersPromotionActive({ starts_at: event.starts_at, ends_at: null }, Date.parse("2026-09-20T00:00:00Z"))).toBe(false);
  });

  it("keeps the offers clock live and removes campaign-specific hardcoded expiry", () => {
    expect(app).toContain("const [nowMs, setNowMs] = useState(() => Date.now())");
    expect(app).toContain("window.setInterval(syncNow, 30_000)");
    expect(app).toContain('document.addEventListener("visibilitychange", syncNow)');
    expect(app).not.toContain("cineStarKinoDaysOfferExpiresAt");
  });

  it("gates both CineStar and Noc vedy by the same canonical lifecycle helper", () => {
    expect(app).toContain("isCityPostersPromotionActive(loadedNocVedyOffer, nowMs)");
    expect(app).toContain("isCityPostersPromotionActive(cineStarKinoDaysEvent, nowMs)");
    expect(app).toContain("loadCityPostersEventBySlug(slug, language)");
  });

  it("uses the Supabase secret key as apikey for maintenance Edge dispatch", () => {
    expect(maintenance).toContain('const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")');
    expect(maintenance).toContain("apikey: serviceRoleKey");
    expect(maintenance).toContain("Authorization: `Bearer ${serviceRoleKey}`");
    expect(maintenance).toContain('action: "maintain_city_poster_publications"');
  });
});
