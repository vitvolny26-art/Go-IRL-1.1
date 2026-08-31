import { describe, expect, it } from "vitest";
import {
  beautySlugFromPublicLink,
  buildBeautyPublicLink,
  buildTelegramBeautyInviteUrl,
  buildTelegramBeautyShareInviteUrl,
  buildTelegramBeautyShareStartParam,
  isValidBeautyPublicSlug,
  normalizeBeautyPublicSlug,
  parseBeautyStartAttribution,
  parseBeautyStartParam,
} from "./beautyPublicSlug";

describe("Beauty public slug", () => {
  it("normalizes an English public name under the Beauty namespace", () => {
    expect(normalizeBeautyPublicSlug("  Test Studio  ")).toBe("beauty-test-studio");
    expect(isValidBeautyPublicSlug("beauty-test-studio")).toBe(true);
    expect(buildBeautyPublicLink("test-studio")).toBe("/beauty/beauty-test-studio");
  });

  it("rejects unrelated and malformed startapp values", () => {
    expect(isValidBeautyPublicSlug("тест-студия")).toBe(false);
    expect(parseBeautyStartParam("event-1")).toBe("");
    expect(parseBeautyStartParam("beauty-test--studio")).toBe("");
    expect(parseBeautyStartParam("beauty-test--studio__tgmsg")).toBe("");
    expect(parseBeautyStartAttribution("beauty-test--studio__tgmsg")).toEqual({});
  });

  it("extracts existing legacy and editable Beauty slugs", () => {
    expect(beautySlugFromPublicLink("/beauty/beauty-06b9689e8b1ee69a")).toBe("beauty-06b9689e8b1ee69a");
    expect(beautySlugFromPublicLink("https://goirl.example/beauty/beauty-test-studio")).toBe("beauty-test-studio");
  });

  it("builds the same Telegram Mini App shape as Sport", () => {
    expect(buildTelegramBeautyInviteUrl("test-studio", "@GOirl_bot"))
      .toBe("https://t.me/GOirl_bot?startapp=beauty-test-studio");
  });

  it("encodes Telegram message attribution inside the Mini App startapp payload", () => {
    expect(buildTelegramBeautyShareStartParam("test-studio"))
      .toBe("beauty-test-studio__tgmsg");
    expect(buildTelegramBeautyShareInviteUrl("test-studio", "@GOirl_bot", "goirl"))
      .toBe("https://t.me/GOirl_bot/goirl?startapp=beauty-test-studio__tgmsg");
    expect(parseBeautyStartParam("beauty-test-studio__tgmsg"))
      .toBe("beauty-test-studio");
    expect(parseBeautyStartAttribution("beauty-test-studio__tgmsg"))
      .toEqual({ source: "telegram", medium: "message" });
    expect(parseBeautyStartAttribution("beauty-test-studio"))
      .toEqual({});
  });
});
