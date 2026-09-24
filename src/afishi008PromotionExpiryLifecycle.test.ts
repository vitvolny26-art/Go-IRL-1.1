import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cityPostersPromotionExpiryMs, isCityPostersPromotionActive } from "./city-posters/cityPostersPromotionLifecycle";
import { verifySupabaseServiceRoleJwt } from "../supabase/functions/telegramEventSupergroup/serviceRoleAuthorization";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const maintenance = readFileSync(new URL("../api/city-posters/maintenance.ts", import.meta.url), "utf8");
const telegramEdge = readFileSync(new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url), "utf8");

const signServiceRoleJwt = async ({
  secret,
  role = "service_role",
  exp = Math.floor(Date.now() / 1000) + 3600,
}: {
  secret: string;
  role?: string;
  exp?: number;
}) => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ iss: "supabase", role, exp });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Buffer.from(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  )).toString("base64url");
  return `${header}.${payload}.${signature}`;
};

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

  it("cryptographically accepts only a valid Supabase service-role JWT for maintenance", async () => {
    const secret = "afishi008-test-jwt-secret";
    const token = await signServiceRoleJwt({ secret });
    expect(await verifySupabaseServiceRoleJwt(token, secret)).toBe(true);
    expect(await verifySupabaseServiceRoleJwt(token, "wrong-secret")).toBe(false);
    expect(await verifySupabaseServiceRoleJwt(await signServiceRoleJwt({ secret, role: "authenticated" }), secret)).toBe(false);
    expect(await verifySupabaseServiceRoleJwt(await signServiceRoleJwt({ secret, exp: 1 }), secret)).toBe(false);
    expect(telegramEdge).toContain('verifySupabaseServiceRoleJwt(request.headers.get("apikey"), jwtSecret)');
    expect(telegramEdge).toContain('verifySupabaseServiceRoleJwt(bearerToken, jwtSecret)');
  });
});
