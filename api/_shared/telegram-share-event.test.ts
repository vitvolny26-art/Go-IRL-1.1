import { describe, expect, it } from "vitest";
import {
  isIndexableEventVisibility,
  isShareLanguage,
  isShareableEventVisibility,
  localizedShareDescription,
} from "./telegram-share-event.js";

describe("shareable event visibility", () => {
  it("allows public and invite-only events shared by their UUID", () => {
    expect(isShareableEventVisibility("public")).toBe(true);
    expect(isShareableEventVisibility("invite")).toBe(true);
  });

  it("does not expose private events through public Meta endpoints", () => {
    expect(isShareableEventVisibility("private")).toBe(false);
  });

  it("indexes only public activities", () => {
    expect(isIndexableEventVisibility("public")).toBe(true);
    expect(isIndexableEventVisibility("invite")).toBe(false);
    expect(isIndexableEventVisibility("private")).toBe(false);
  });

  it("accepts all six Telegram Activity share languages", () => {
    for (const language of ["ru", "uk", "cs", "en", "pl", "sk"]) {
      expect(isShareLanguage(language)).toBe(true);
    }
    expect(isShareLanguage("de")).toBe(false);
  });

  it("uses the established content fallback contract for six share languages", () => {
    expect(localizedShareDescription("Школа Зейерова", "ZŠ Zeyerova", "cs")).toBe("ZŠ Zeyerova");
    expect(localizedShareDescription("Школа Зейерова", "ZŠ Zeyerova", "sk")).toBe("ZŠ Zeyerova");
    expect(localizedShareDescription("Школа Зейерова", "ZŠ Zeyerova", "ru")).toBe("Школа Зейерова");
    expect(localizedShareDescription("Школа Зейерова", "ZŠ Zeyerova", "uk")).toBe("Школа Зейерова");
    expect(localizedShareDescription("Школа Зейерова", "ZŠ Zeyerova", "en")).toBe("Школа Зейерова");
    expect(localizedShareDescription("Школа Зейерова", "ZŠ Zeyerova", "pl")).toBe("Школа Зейерова");
  });
});
