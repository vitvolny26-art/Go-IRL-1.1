import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const helper = readFileSync(new URL("./telegram-city-publication.ts", import.meta.url), "utf8");
const edge = readFileSync(new URL("../../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../../src/activityShareCardPersistence.ts", import.meta.url), "utf8");

describe("canonical city Telegram source contract", () => {
  it("reuses the ordinary Telegram Share pipeline and exact-message pin lifecycle", () => {
    expect(helper).toContain("loadTrustedTelegramEventCard");
    expect(helper).toContain("buildTelegramEventCard");
    expect(helper).toContain("createTelegramShareCardToken");
    expect(helper).toContain("sendPhoto");
    expect(helper).toContain("pinChatMessage");
    expect(helper).toContain("unpinChatMessage");
    expect(helper).not.toContain("unpinAllChatMessages");
  });

  it("routes create, repeat and due-unpin through the same canonical endpoint", () => {
    expect(edge).toContain("city-event-publication");
    expect(edge).toContain('action: "publish"');
    expect(edge).toContain('action: "unpin_due"');
    expect(edge).toContain('action === "publish_city_activity"');
    expect(edge).toContain("publishPublicActivity");
  });

  it("preserves tracked publication metadata on edits and unpins before delete", () => {
    expect(helper).toContain("unpinCanonicalCityActivity");
    expect(helper).toContain("const dueAt = activityEndsAt(activity)");
    expect(edge).toContain('action === "unpin_city_activity"');
    expect(edge).toContain('action: "unpin_activity"');
    expect(persistence).toContain("preserveCityTelegramPublicationMetadata");
    const unpinIndex = persistence.indexOf("await unpinCityActivity(id)");
    const deleteIndex = persistence.indexOf("await deleteActivity(id)");
    expect(unpinIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThan(unpinIndex);
  });
});
