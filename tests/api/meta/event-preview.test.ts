import { describe, expect, it } from "vitest";
import {
  buildBeautyLandingUrl,
  buildBeautyServiceJsonLd,
  buildEventJsonLd,
  buildEventAttributionCapture,
  metaEventPreviewCopy,
  setCardImageResponseHeaders,
} from "../../../api/meta/event-preview.js";
import vercel from "../../../vercel.json";
import source from "../../../api/meta/event-preview.ts?raw";

describe("Meta event preview copy", () => {
  it("localizes web and Telegram share landing actions", () => {
    expect(metaEventPreviewCopy.ru).toEqual({ open: "Открыть GO IRL", telegram: "Открыть в Telegram" });
    expect(metaEventPreviewCopy.uk).toEqual({ open: "Відкрити GO IRL", telegram: "Відкрити в Telegram" });
    expect(metaEventPreviewCopy.cs).toEqual({ open: "Otevřít GO IRL", telegram: "Otevřít v Telegramu" });
    expect(metaEventPreviewCopy.en).toEqual({ open: "Open GO IRL", telegram: "Open in Telegram" });
  });

  it("routes short Activity and Service landings to their HTML preview handlers", () => {
    expect(vercel.rewrites).toContainEqual({
      source: "/e/:id",
      destination: "/api/meta/event-preview?event=:id&capture=activity-attribution-v1",
    });
    expect(vercel.rewrites).toContainEqual({
      source: "/s/:slug",
      destination: "/api/meta/beauty-preview?slug=:slug",
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

  it("keeps calendar export support without exposing it as a share landing CTA", () => {
    expect(source).toContain("buildMetaEventCalendar(card, canonicalUrl)");
    expect(source).not.toContain("addToCalendarUrl");
    expect(source).not.toContain("labels.calendar");
  });

  it("canonicalizes short Activity aliases to the stable /e/<id> URL", () => {
    expect(source).toContain("const canonicalUrl = canonicalEventUrl(appOrigin, card.eventId)");
    expect(source).toContain('<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />');
    expect(source).toContain('<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />');
  });

  it("renders language-specific Activity JPEGs on demand", () => {
    expect(source).toContain("renderTelegramShareCardJpeg(card)");
    expect(source).toContain('`${alias}-${card.language}.jpg`');
    expect(source).not.toContain("loadActivityShareCard");
    expect(source).not.toContain("persistActivityShareCard");
  });

  it("renders language-specific Service JPEGs on demand", () => {
    expect(source).toContain("renderTelegramBeautyShareCardJpeg(card)");
    expect(source).toContain('`${slug}-${language}.jpg`');
    expect(source).not.toContain("sendStoredBeautyCardImage");
    expect(source).not.toContain("artwork.imageUrl");
  });

  it("keeps Activity social images on the canonical public origin", () => {
    expect(source).toContain('const image = new URL("/api/meta/event-preview", appOrigin)');
    expect(source).toContain('image.searchParams.set("alias", publicAlias)');
    expect(source).toContain('image.searchParams.set("language", card.language)');
    expect(source).toContain('image.searchParams.set("format", "image")');
    expect(source).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(source).toContain('<meta name="twitter:image"');
  });

  it("does not expose signed card payloads through Activity SEO image URLs", () => {
    expect(source).not.toContain("createMetaInvitationCardToken");
    expect(source).not.toContain("event-invitation-card?token=");
  });

  it("emits safe Event JSON-LD only for indexable public activities", () => {
    const base = {
      title: '</script><script>alert("x")</script>',
      activity: "Волейбол",
      eventDate: "2026-08-16",
      time: "16:30",
      address: "ZŠ Demlova",
      city: "Оломоуц",
      organizer: "GO IRL",
      price: 0,
    } as const;
    const publicJson = buildEventJsonLd(
      { ...base, visibility: "public" },
      "https://go-irl.fun/e/ac72a1b4-814e-48ff-88b6-ff82d2751e63",
      "https://go-irl.fun/api/meta/event-preview?alias=Vol260816_a&format=image",
    );
    expect(publicJson).toContain('"@type":"Event"');
    expect(publicJson).toContain('"startDate":"2026-08-16T16:30:00"');
    expect(publicJson).toContain("\\u003c/script>");
    expect(publicJson).not.toContain("</script>");
    expect(buildEventJsonLd(
      { ...base, visibility: "invite" },
      "https://go-irl.fun/e/ac72a1b4-814e-48ff-88b6-ff82d2751e63",
      "https://go-irl.fun/branding/go-irl-logo.jpg",
    )).toBeNull();
  });

  it("fails closed against indexing non-public Activity pages", () => {
    expect(source).toContain('response.setHeader("X-Robots-Tag", "noindex, nofollow")');
    expect(source).toContain('<meta name="robots" content="noindex,nofollow" />');
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

  it("emits canonical Service SEO with a language-specific on-demand image URL", () => {
    expect(source).toContain("const canonicalUrl = canonicalBeautyUrl(appOrigin, slug)");
    expect(source).toContain('image.searchParams.set("language", language)');
    expect(source).toContain('image.searchParams.set("v", "13")');
    expect(source).toContain('<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />');
    expect(source).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(source).toContain('<script type="application/ld+json">${jsonLd}</script>');
  });

  it("builds safe Service JSON-LD without internal storage or identity fields", () => {
    const json = buildBeautyServiceJsonLd({
      title: "Gel manicure",
      activity: "Anna Studio",
      description: "Nails in Olomouc",
      organizer: "Anna",
      city: "Olomouc",
      price: 890,
    } as never, "https://go-irl.fun/s/beauty-anna", "https://go-irl.fun/api/meta/event-preview?slug=beauty-anna&format=image");
    expect(json).toContain('"@type":"Service"');
    expect(json).toContain('"price":890');
    expect(json).not.toContain("profile_id");
    expect(json).not.toContain("object_path");
    expect(json).not.toContain("token=");
  });

  it("uses web/PWA as primary and Telegram as secondary share landing actions", () => {
    expect(source).toContain("const openUrl = eventLandingUrl(appOrigin, card.eventId, card.language)");
    expect(source).toContain("const telegramUrl = card.inviteUrl");
    expect(source).toContain("metaBeautyPreviewCopy[card.language].telegram");
  });

  it("keeps Beauty booking dates out of the public profile URL", () => {
    expect(buildBeautyLandingUrl("https://go-irl.fun", "beauty-test", "cs"))
      .toBe("https://go-irl.fun/beauty/beauty-test/cs");
  });

  it("fails closed when a Service profile is not public", () => {
    expect(source).toContain('response.setHeader("X-Robots-Tag", "noindex, nofollow")');
    expect(source).toContain('return response.status(404).end("not_found")');
  });
});
