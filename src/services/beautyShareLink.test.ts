import { describe, expect, it } from "vitest";
import { buildCardShareTarget, normalizeCardShareUrl } from "../cardShare";
import { buildBeautyPublicLink, buildBeautyPublicUrl } from "./beautyShareLink";

describe("Beauty Telegram sharing", () => {
  it("builds a canonical Beauty profile URL from the slug", () => {
    expect(buildBeautyPublicLink("beauty-06b9689e8b1ee69a")).toBe("/beauty/beauty-06b9689e8b1ee69a");
    expect(buildBeautyPublicUrl("beauty-06b9689e8b1ee69a", "https://go-irl-1-0.vercel.app")).toBe(
      "https://go-irl-1-0.vercel.app/beauty/beauty-06b9689e8b1ee69a",
    );
  });

  it("removes accidentally appended card text from a Beauty URL", () => {
    const malformed = "https://go-irl-1-0.vercel.app/beauty/beauty-06b9689e8b1ee69aGO IRL: Test Studio03 авг · 09:00Центр, Оломоуц";
    expect(normalizeCardShareUrl(malformed)).toBe(
      "https://go-irl-1-0.vercel.app/beauty/beauty-06b9689e8b1ee69a",
    );
  });

  it("keeps Telegram URL and message in separate query parameters", () => {
    const target = new URL(buildCardShareTarget("telegram", {
      title: "Test Studio",
      date: "03 авг · 09:00",
      address: "Центр, Оломоуц",
      url: "https://go-irl-1-0.vercel.app/beauty/beauty-06b9689e8b1ee69aGO IRL: Test Studio03 авг · 09:00Центр, Оломоуц",
    }));

    expect(target.origin + target.pathname).toBe("https://t.me/share/url");
    expect(target.searchParams.get("url")).toBe(
      "https://go-irl.fun/s/beauty-06b9689e8b1ee69a/ru?source=telegram&medium=message",
    );
    expect(target.searchParams.get("text")).toBe(
      "GO IRL: Test Studio\n03 авг · 09:00\nЦентр, Оломоуц",
    );
  });
});
