import { describe, expect, it } from "vitest";
import {
  buildAttributedOrganicCardShareContent,
  buildCardShareSmartUrl,
  buildCardShareTarget,
  buildCardShareDownloadUrl,
  buildCardShareImageUrl,
  buildCardShareLandingUrl,
  buildCardShareText,
  buildFacebookShareTarget,
  buildMessengerAndroidIntentTarget,
  buildMessengerAppTarget,
  buildMessengerPreviewUrl,
  buildMessengerShareBridgeTarget,
  buildMetaEventPreviewUrl,
  buildOrganicCardShareContent,
  isBeautyCardShareContent,
} from "./cardShare";

const eventId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";
const content = {
  title: "Ролики в парке",
  date: "16 июл. · 18:00",
  address: "Smetanovy sady, Olomouc",
  url: `https://t.me/GOirl_bot?startapp=${eventId}`,
};
const shortUrl = "https://go-irl.fun/Vol260816_a";
const sharedContent = { ...content, shareAlias: "Vol260816_a" };
const previewUrl = `https://go-irl-1-1.vercel.app/api/meta/event-preview?event=${eventId}&language=ru`;

describe("card share", () => {
  it("keeps the exact event deep link in the share text", () => {
    expect(buildCardShareText(content)).toBe(`GO IRL: Ролики в парке\n16 июл. · 18:00\nSmetanovy sady, Olomouc\n\n${content.url}`);
  });

  it("uses only a server-issued compact Activity alias", () => {
    expect(buildCardShareLandingUrl(sharedContent)).toBe(`${shortUrl}/ru`);
    expect(buildCardShareLandingUrl(content)).toBe(`https://go-irl.fun/e/${eventId}/ru`);
  });

  it("uses attributed compact public landings for Telegram and WhatsApp", () => {
    const telegramTarget = new URL(buildCardShareTarget("telegram", sharedContent));
    expect(telegramTarget.origin + telegramTarget.pathname).toBe("https://t.me/share/url");
    expect(telegramTarget.searchParams.get("url")).toBe(`${shortUrl}/ru?source=telegram&medium=message`);
    const whatsappTarget = new URL(buildCardShareTarget("whatsapp", sharedContent));
    expect(whatsappTarget.origin).toBe("https://wa.me");
    expect(whatsappTarget.searchParams.get("text")).toBe(`${shortUrl}/ru?source=whatsapp&medium=message`);
  });

  it("separates the canonical public landing domain from the Vercel image API", () => {
    expect(buildCardShareLandingUrl(sharedContent)).toBe(`${shortUrl}/ru`);
    expect(buildCardShareImageUrl(content)).toContain("https://go-irl-1-1.vercel.app/api/meta/event-preview?");
  });

  it("downloads Activity JPEG through canonical same-origin while preserving preview params", () => {
    const download = new URL(buildCardShareDownloadUrl(content));
    expect(download.origin).toBe("https://go-irl.fun");
    expect(download.pathname).toBe("/api/meta/event-preview");
    expect(download.searchParams.get("event")).toBe(eventId);
    expect(download.searchParams.get("language")).toBe("ru");
    expect(download.searchParams.get("format")).toBe("download");
  });

  it("builds provider-mapped smart URLs from a server-issued compact Activity URL", () => {
    expect(buildCardShareSmartUrl(sharedContent, "instagram", { campaign: "olomouc-pilot-v1", ref: "pub_42" })).toBe(
      `${shortUrl}/ru?source=instagram&medium=share&campaign=olomouc-pilot-v1&ref=pub_42`,
    );
    expect(buildAttributedOrganicCardShareContent(sharedContent, "native").url).toBe(
      `${shortUrl}/ru?source=native&medium=share`,
    );
  });

  it("builds one shared Meta preview URL for the same event", () => {
    expect(buildMetaEventPreviewUrl(content)).toBe(previewUrl);
    expect(buildMessengerPreviewUrl(content)).toBe(previewUrl);
    expect(buildOrganicCardShareContent(content)).toEqual({
      title: "GO IRL: Ролики в парке",
      text: "16 июл. · 18:00\nSmetanovy sady, Olomouc",
      url: previewUrl,
    });
  });

  it("builds separate JPEG preview and attachment URLs", () => {
    const image = new URL(buildCardShareImageUrl(content));
    const download = new URL(buildCardShareDownloadUrl(content));
    expect(image.pathname).toBe("/api/meta/event-preview");
    expect(image.searchParams.get("event")).toBe(eventId);
    expect(image.searchParams.get("format")).toBe("image");
    expect(download.pathname).toBe(image.pathname);
    expect(download.searchParams.get("event")).toBe(eventId);
    expect(download.searchParams.get("format")).toBe("download");
  });

  it("keeps Facebook separate from Messenger and uses the Facebook smart URL", () => {
    const target = new URL(buildFacebookShareTarget(content));
    const smartUrl = buildCardShareSmartUrl(content, "facebook");
    expect(target.origin + target.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
    expect(target.searchParams.get("u")).toBe(smartUrl);
    expect(target.searchParams.get("quote")).toContain(smartUrl);
    expect(target.searchParams.get("quote")).not.toContain("/api/meta/event-preview");
    expect(buildCardShareTarget("facebook", content)).toBe(target.toString());
  });

  it("uses the Messenger smart URL in the Send Dialog", () => {
    const target = new URL(buildCardShareTarget("messenger", content));
    expect(target.origin + target.pathname).toBe("https://www.facebook.com/dialog/send");
    expect(target.searchParams.get("app_id")).toBe("1332867179009910");
    expect(target.searchParams.get("link")).toBe(buildCardShareSmartUrl(content, "messenger"));
    expect(target.searchParams.get("redirect_uri")).toBe("https://go-irl.fun");
  });

  it("builds native Messenger targets for mobile devices", () => {
    expect(buildMessengerAppTarget(content)).toContain("fb-messenger://share/");
    const android = buildMessengerAndroidIntentTarget(content);
    expect(android).toContain("intent://share/");
    expect(android).toContain("package=com.facebook.orca");
    expect(android).toContain("S.browser_fallback_url=");
  });

  it("uses the public HTTPS share bridge with the Messenger smart URL", () => {
    const target = new URL(buildMessengerShareBridgeTarget(content));
    expect(target.origin).toBe("https://go-irl.fun");
    expect(target.pathname).toBe("/messenger-share.html");
    expect(target.searchParams.get("title")).toBe(content.title);
    expect(target.searchParams.get("date")).toBe(content.date);
    expect(target.searchParams.get("address")).toBe(content.address);
    expect(target.searchParams.get("url")).toBe(buildCardShareSmartUrl(content, "messenger"));
  });

  it("falls back to the original URL when no valid event id is present", () => {
    const fallback = { ...content, url: "https://example.com/event" };
    expect(buildMetaEventPreviewUrl(fallback)).toBe(fallback.url);
    expect(buildCardShareDownloadUrl(fallback)).toBe("");
  });

  it("attributes Beauty shares without leaking booking dates into the landing URL", () => {
    const beauty = {
      title: "Test Studio",
      date: "03 авг · 09:00",
      address: "Центр, Оломоуц",
      url: "https://go-irl.fun/beauty/beauty-test-studio",
    };
    const preview = new URL(buildMetaEventPreviewUrl(beauty));
    expect(preview.origin).toBe("https://go-irl-1-1.vercel.app");
    expect(preview.pathname).toBe("/api/meta/event-preview");
    expect(preview.searchParams.get("slug")).toBe("beauty-test-studio");
    expect(preview.searchParams.get("date")).toBe(beauty.date);
    expect(preview.searchParams.get("v")).toBe("14");
    expect(buildCardShareLandingUrl(beauty)).toBe("https://go-irl.fun/s/beauty-test-studio/ru");
    expect(buildCardShareLandingUrl(beauty)).not.toContain("date=");
    expect(buildCardShareSmartUrl(beauty, "instagram")).toBe(
      "https://go-irl.fun/s/beauty-test-studio/ru?source=instagram&medium=share",
    );
    expect(isBeautyCardShareContent(beauty)).toBe(true);

    const download = new URL(buildCardShareDownloadUrl(beauty));
    expect(download.origin).toBe("https://go-irl.fun");
    expect(download.pathname).toBe("/api/meta/event-preview");
    expect(download.searchParams.get("slug")).toBe("beauty-test-studio");
    expect(download.searchParams.get("format")).toBe("download");

    const whatsapp = new URL(buildCardShareTarget("whatsapp", beauty));
    expect(whatsapp.searchParams.get("text")).toBe(
      "https://go-irl.fun/s/beauty-test-studio/ru?source=whatsapp&medium=message",
    );
    const telegram = new URL(buildCardShareTarget("telegram", beauty));
    expect(telegram.origin + telegram.pathname).toBe("https://t.me/share/url");
    const telegramMiniApp = new URL(telegram.searchParams.get("url") || "");
    expect(telegramMiniApp.origin + telegramMiniApp.pathname).toBe("https://t.me/GOirl_bot");
    expect(telegramMiniApp.searchParams.get("startapp")).toBe("beauty-test-studio__tgmsg");
  });
});
