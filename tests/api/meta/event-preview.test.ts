import { describe, expect, it } from "vitest";
import {
  buildEventAttributionCapture,
  metaEventPreviewCopy,
  setCardImageResponseHeaders,
} from "../../../api/meta/event-preview.js";
import vercel from "../../../vercel.json";
import source from "../../../api/meta/event-preview.ts?raw";

describe("Meta event preview copy", () => {
  it("localizes the same two public actions as the Telegram card", () => {
    expect(metaEventPreviewCopy.ru).toEqual({ open: "Открыть GO IRL", calendar: "В календарь" });
    expect(metaEventPreviewCopy.uk).toEqual({ open: "Відкрити GO IRL", calendar: "У календар" });
    expect(metaEventPreviewCopy.cs).toEqual({ open: "Otevřít GO IRL", calendar: "Do kalendáře" });
    expect(metaEventPreviewCopy.en).toEqual({ open: "Open GO IRL", calendar: "Add to calendar" });
  });

  it("routes short Activity and Service landings to the HTML preview handler", () => {
    expect(vercel.rewrites).toContainEqual({
      source: "/e/:id",
      destination: "/api/meta/event-preview?event=:id&capture=activity-attribution-v1",
    });
    expect(vercel.rewrites).toContainEqual({
      source: "/s/:slug",
      destination: "/api/meta/event-preview?slug=:slug",
    });
  });

  it("serializes valid attribution for the canonical Activity entry", () => {
    const eventId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";
    const result = buildEventAttributionCapture(eventId, {
      source: "instagram",
      medium: "story",
      campaign: "olomouc-pilot-v1",
      ref: "pub_42",
    });
    expect(result.attributed).toBe(true);
    expect(result.script).toContain("go-irl-social-attribution-v1");
    expect(result.script).toContain("olomouc-pilot-v1");
    expect(result.script).toContain(`/e/${eventId}`);
  });

  it("drops invalid attribution and clears stale transient state", () => {
    const result = buildEventAttributionCapture("3b172dd9-d5e2-4328-86a4-d4107a6359fc", {
      source: "Instagram",
      medium: "email",
      ref: "user@example.com",
    });
    expect(result.attributed).toBe(false);
    expect(result.script).toContain("sessionStorage.removeItem");
  });

  it("keeps calendar details on the canonical app URL", () => {
    expect(source).toContain("buildMetaEventGoogleCalendarUrl(card, canonicalUrl)");
    expect(source).toContain("buildMetaEventCalendar(card, canonicalUrl)");
    expect(source).toContain("const imageUrl = secret");
    expect(source).toContain("`${apiOrigin}/api/meta/event-invitation-card");
  });

  it("returns Telegram-compatible attachment headers only for downloads", () => {
    const attachmentHeaders = new Map<string, string>();
    setCardImageResponseHeaders({
      setHeader: (name, value) => attachmentHeaders.set(name, value),
    }, 1234, true);
    expect(attachmentHeaders.get("Content-Type")).toBe("image/jpeg");
    expect(attachmentHeaders.get("Content-Length")).toBe("1234");
    expect(attachmentHeaders.get("Content-Disposition")).toContain("attachment");
    expect(attachmentHeaders.get("Access-Control-Allow-Origin")).toBe("https://web.telegram.org");

    const previewHeaders = new Map<string, string>();
    setCardImageResponseHeaders({
      setHeader: (name, value) => previewHeaders.set(name, value),
    }, 1234, false, "no-store");
    expect(previewHeaders.get("Access-Control-Allow-Origin")).toBe("*");
    expect(previewHeaders.get("Cache-Control")).toBe("no-store");
    expect(previewHeaders.has("Content-Disposition")).toBe(false);
  });

  it("serves the saved Beauty JPEG before the compatibility renderer", () => {
    expect(source).toContain("loadTrustedBeautyShareArtwork");
    expect(source).toContain("sendStoredBeautyCardImage");
    expect(source).toContain("artwork.imageUrl");
    expect(source).toContain('image.searchParams.set("v", artwork?.version || "12")');
    expect(source).toContain('og:image:height" content="900"');
    expect(source).toContain("aspect-ratio:6/5");
    expect(source).toContain("https://go-irl.fun");
    expect(source).toContain("renderBeautyShareCardJpeg");
  });
});
