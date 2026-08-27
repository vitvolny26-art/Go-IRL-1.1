import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import vercelConfig from "../../../vercel.json";

const source = readFileSync(
  new URL("../../../api/telegram/prepared-share.ts", import.meta.url),
  "utf8",
);

describe("consolidated prepared Telegram share route", () => {
  it("shares one bounded browser transport and Telegram session validation shell", () => {
    expect(source).toContain('type PreparedShareKind = "event" | "beauty"');
    expect(source).toContain('const allowedBrowserOrigins = new Set(["https://go-irl.fun", "https://go-irl-1-1.vercel.app"])');
    expect(source).toContain('response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")');
    expect(source).toContain('response.setHeader("Access-Control-Allow-Headers", "Content-Type")');
    expect(source).toContain('if (request.method === "OPTIONS") return response.status(204).end()');
    expect(source).toContain("const MAX_BODY_BYTES = 16 * 1024");
    expect(source).toContain("await readBody(request)");
    expect(source).toContain('return json(response, 413, { error: "payload_too_large" })');
    expect(source).toContain("validateTelegramInitData");
    expect(source).toContain("savePreparedInlineMessage");
  });

  it("reuses the persisted Activity image and preserves Beauty behavior", () => {
    expect(source).toContain('const card = await loadTrustedTelegramEventCard(eventId, language)');
    expect(source).toContain("signedActivityShareCardUrl");
    expect(source).toContain("const imageUrl = await signedActivityShareCardUrl(card)");
    expect(source).not.toContain("Promise.all(languages.map");
    expect(source).not.toContain("persistActivityShareCard");
    expect(source).not.toContain("createTelegramShareCardToken");
    expect(source).not.toContain('new URL("/api/telegram/event-share-card"');
    expect(source).toContain("loadTrustedTelegramBeautyCard");
    expect(source).toContain("loadTrustedBeautyShareArtwork");
    expect(source).toContain("const persistedArtwork = await loadTrustedBeautyShareArtwork(card.eventId).catch(() => null)");
    expect(source).toContain('const telegramMediaOrigin = "https://go-irl-1-1.vercel.app"');
    expect(source).toContain('const image = new URL("/api/meta/event-preview", telegramMediaOrigin)');
    expect(source).toContain('image.searchParams.set("format", "image")');
    expect(source).not.toContain('image.searchParams.set("format", "download")');
    expect(source).toContain('image.searchParams.set("v", "15")');
    expect(source).toContain("const imageUrl = persistedArtwork?.imageUrl || image.toString()");
    expect(source).toContain("buildSocialAttributionUrl");
    expect(source).toContain('const publicAppFallbackOrigin = "https://go-irl.fun"');
  });

  it("keeps both legacy API URLs stable through Vercel rewrites", () => {
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/api/telegram/prepared-event-share",
      destination: "/api/telegram/prepared-share?kind=event",
    });
    expect(vercelConfig.rewrites).toContainEqual({
      source: "/api/telegram/prepared-beauty-share",
      destination: "/api/telegram/prepared-share?kind=beauty",
    });
  });
});
