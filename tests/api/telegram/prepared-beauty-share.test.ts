import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import vercelConfig from "../../../vercel.json";

const source = readFileSync(
  new URL("../../../api/telegram/prepared-share.ts", import.meta.url),
  "utf8",
);
const mediaSource = readFileSync(
  new URL("../../../api/telegram/event-share-card.ts", import.meta.url),
  "utf8",
);
const storageSource = readFileSync(
  new URL("../../../api/_shared/activity-share-card-storage.ts", import.meta.url),
  "utf8",
);
const eventSource = readFileSync(
  new URL("../../../api/_shared/telegram-share-event.ts", import.meta.url),
  "utf8",
);
const persistenceSource = readFileSync(
  new URL("../../../api/share/persist-event-cards.ts", import.meta.url),
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

  it("uses a stable Vercel media URL for persisted Activity cards and preserves Beauty behavior", () => {
    expect(source).toContain('const card = await loadTrustedTelegramEventCard(eventId, language)');
    expect(source).toContain("createTelegramShareCardToken");
    expect(source).toContain('const image = new URL("/api/telegram/event-share-card", telegramMediaOrigin)');
    expect(source).toContain('image.searchParams.set("mode", "persisted")');
    expect(source).not.toContain("signedActivityShareCardUrl");
    expect(source).not.toContain("Promise.all(languages.map");
    expect(source).not.toContain("persistActivityShareCard");
    expect(mediaSource).toContain('if (mode === "persisted") return renderPersistedTelegramCard(token, response)');
    expect(mediaSource).toContain("freshActivityShareCardJpeg(card)");
    expect(mediaSource).toContain("loadTrustedTelegramEventCard(tokenCard.eventId, tokenCard.language, { includeParticipants: false })");
    expect(mediaSource).not.toContain("signedActivityShareCardUrl");
    expect(mediaSource).not.toContain("fetch(signedUrl)");
    expect(mediaSource).toContain('console.warn("telegram_persisted_card_failed", { stage: "load_card" })');
    expect(mediaSource).toContain('console.warn("telegram_persisted_card_failed", { stage: "render_card" })');
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

  it("refreshes stale persisted cards while preserving live provider participant summaries", () => {
    expect(eventSource).toContain("updated_at");
    expect(eventSource).toContain("sourceUpdatedAt: row.updated_at");
    expect(eventSource).toContain("includeParticipants?: boolean");
    expect(eventSource).toContain("if (options.includeParticipants !== false)");
    expect(eventSource).toContain('.from("activity_members")');
    expect(eventSource).toContain("participants = count || 0");
    expect(persistenceSource).toContain("{ includeParticipants: false }");
    expect(storageSource).toContain("versionPath");
    expect(storageSource).toContain("storedVersion === card.sourceUpdatedAt");
    expect(storageSource).toContain("freshActivityShareCardJpeg");
    expect(storageSource).toContain('storageStage: "alias"');
    expect(storageSource).toContain('storageStage: "persist"');
    expect(storageSource).toContain("await persistActivityShareCard(card, alias, rendered)");
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
