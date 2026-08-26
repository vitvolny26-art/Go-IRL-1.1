import { describe, expect, it } from "vitest";
import { buildCardShareSmartUrl, buildCardShareTarget } from "./cardShare";
import { serviceBookingMutationRepositoryInternals } from "./services/servicesBookingMutationRepository";

const beautyContent = {
  title: "Studio Vita",
  date: "26 Aug",
  address: "Olomouc",
  url: "https://go-irl.fun/beauty/beauty-studio-vita",
  language: "en" as const,
};

describe("GROOMING015 Beauty acquisition attribution", () => {
  it("decorates Beauty share landing URLs instead of bypassing attribution", () => {
    expect(buildCardShareSmartUrl(beautyContent, "facebook"))
      .toBe("https://go-irl.fun/s/beauty-studio-vita/en?source=facebook&medium=share");
    expect(buildCardShareSmartUrl(beautyContent, "telegram"))
      .toBe("https://go-irl.fun/s/beauty-studio-vita/en?source=telegram&medium=message");
  });

  it("uses attributed Beauty URLs for Telegram and WhatsApp targets", () => {
    const telegram = new URL(buildCardShareTarget("telegram", beautyContent));
    expect(telegram.searchParams.get("url")).toContain("source=telegram");
    expect(decodeURIComponent(buildCardShareTarget("whatsapp", beautyContent))).toContain("source=whatsapp");
  });

  it("sanitizes browser attribution before the booking RPC handoff", () => {
    expect(serviceBookingMutationRepositoryInternals.currentBeautyAttribution(
      "?source=instagram&medium=story&campaign=olomouc-pilot-v1&ref=pub_42&email=x@example.com",
    )).toEqual({
      source: "instagram",
      medium: "story",
      campaign: "olomouc-pilot-v1",
      ref: "pub_42",
    });
    expect(serviceBookingMutationRepositoryInternals.currentBeautyAttribution(
      "?source=Instagram&medium=email&ref=x@example.com",
    )).toEqual({});
  });
});
