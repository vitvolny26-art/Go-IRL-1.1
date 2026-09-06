import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("SHARE018 six-language Telegram Activity share contract", () => {
  it("keeps six Telegram locales across storage, render and city publication", () => {
    const storage = read("../api/_shared/activity-share-card-storage.ts");
    const renderToken = read("../api/_shared/image-render-token.ts");
    const cityBase = read("../api/_shared/telegram-city-publication-base.ts");
    const cityWrapper = read("../api/_shared/telegram-city-publication.ts");
    const normalizedInput = read("../api/_shared/telegram-event-card-input.ts");
    const six = '["ru", "uk", "cs", "en", "pl", "sk"]';

    for (const source of [storage, renderToken, cityBase, cityWrapper, normalizedInput]) {
      expect(source).toContain(six);
    }
  });

  it("persists six Telegram cards while keeping social assets on the existing four locales", () => {
    const persistence = read("../api/share/persist-event-cards.ts");
    const socialStorage = read("../api/_shared/social-share-card-storage.ts");

    expect(persistence).toContain('const telegramShareLanguages: readonly ShareLanguage[] = ["ru", "uk", "cs", "en", "pl", "sk"]');
    expect(persistence).toContain("socialLanguageSet");
    expect(persistence).toContain("...localizedCards.map((card) => persistActivityShareCard(card, alias))");
    expect(persistence).toContain("...socialCards.map((card) => persistSocialShareVariants(card, \"activity\", card.eventId))");
    expect(socialStorage).toContain('socialShareLanguages = ["ru", "uk", "cs", "en"]');
    expect(socialStorage).not.toContain('socialShareLanguages = ["ru", "uk", "cs", "en", "pl", "sk"]');
  });
});
