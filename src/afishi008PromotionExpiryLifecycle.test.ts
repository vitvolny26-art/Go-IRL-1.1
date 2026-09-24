import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cityPostersPromotionExpiryMs, isCityPostersPromotionActive } from "./city-posters/cityPostersPromotionLifecycle";
import { verifySupabaseServiceRoleCredential } from "../supabase/functions/telegramEventSupergroup/serviceRoleAuthorization";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const maintenance = readFileSync(new URL("../api/city-posters/maintenance.ts", import.meta.url), "utf8");
const telegramEdge = readFileSync(new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url), "utf8");

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
    expect(maintenance).not.toContain("Authorization:");
    expect(maintenance).toContain('action: "maintain_city_poster_publications"');
  });

  it("validates maintenance credentials through the server-only Supabase Auth Admin API", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const fetchOk = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response(null, { status: 200 });
    };
    const fetchDenied = async () => new Response(null, { status: 403 });

    expect(await verifySupabaseServiceRoleCredential("service-role-token", "https://project.supabase.co", fetchOk as typeof fetch)).toBe(true);
    expect(await verifySupabaseServiceRoleCredential("anon-token", "https://project.supabase.co", fetchDenied as typeof fetch)).toBe(false);
    expect(await verifySupabaseServiceRoleCredential(null, "https://project.supabase.co", fetchOk as typeof fetch)).toBe(false);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("/auth/v1/admin/users?page=1&per_page=1");
    expect(requests[0].headers.get("apikey")).toBe("service-role-token");
    expect(requests[0].headers.get("authorization")).toBe("Bearer service-role-token");
    expect(telegramEdge).toContain("verifySupabaseServiceRoleCredential(apiKeyToken, supabaseUrl)");
    expect(telegramEdge).toContain("verifySupabaseServiceRoleCredential(bearerToken, supabaseUrl)");
    const maintenanceAuth = telegramEdge.slice(
      telegramEdge.indexOf("const secretKeys = readSupabaseSecretKeys()"),
      telegramEdge.indexOf('if (serviceRoleAuthorized && request.method === "POST")'),
    );
    expect(maintenanceAuth).not.toContain("SUPABASE_JWT_SECRET");
  });
});
