import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const helper = readFileSync(new URL("./telegram-city-publication.ts", import.meta.url), "utf8");
const baseHelper = readFileSync(new URL("./telegram-city-publication-base.ts", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../telegram/city-event-publication.ts", import.meta.url), "utf8");
const edge = readFileSync(new URL("../../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../../src/activityShareCardPersistence.ts", import.meta.url), "utf8");

describe("canonical city Telegram source contract", () => {
  it("reuses Telegram Share while suppressing physical pinning for the read-only card feed", () => {
    expect(helper).toContain("loadTrustedTelegramEventCard");
    expect(helper).toContain("buildTelegramEventCard");
    expect(helper).toContain("createTelegramShareCardToken");
    expect(helper).toContain("sendPhoto");
    expect(helper).toContain('method === "pinChatMessage" || method === "unpinChatMessage"');
    expect(helper).toContain("return true as T");
    expect(helper).toContain('"reopenGeneralForumTopic"');
    expect(helper).toContain('"closeGeneralForumTopic"');
    expect(helper).toContain('"editMessageCaption"');
    expect(helper).not.toContain('"editMessageMedia"');
    expect(helper).not.toContain("unpinAllChatMessages");
  });

  it("routes create, repeat and due-unpin through the same canonical endpoint", () => {
    expect(edge).toContain("city-event-publication");
    expect(edge).toContain('action: "publish"');
    expect(edge).toContain('action: "unpin_due"');
    expect(edge).toContain('action === "publish_city_activity"');
    expect(edge).toContain("publishPublicActivity");
  });

  it("copies the canonical city share into a newly created topic and pins that copy", () => {
    expect(endpoint).toContain('body.action === "create_city_topic"');
    expect(endpoint).toContain('"copyMessage"');
    expect(endpoint).toContain("message_thread_id: topic.messageThreadId");
    expect(endpoint).toContain('"pinChatMessage"');
  });

  it("preserves legacy publication metadata cleanup while the card wrapper suppresses physical pins", () => {
    expect(helper).toContain("unpinCanonicalCityActivity");
    expect(baseHelper).toContain("const dueAt = activityEndsAt(activity)");
    expect(edge).toContain('action === "unpin_city_activity"');
    expect(edge).toContain('action: "unpin_activity"');
    expect(persistence).toContain("preserveCityTelegramPublicationMetadata");
    const unpinIndex = persistence.indexOf("await unpinCityActivity(id)");
    const deleteIndex = persistence.indexOf("await deleteActivity(id)");
    expect(unpinIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeGreaterThan(unpinIndex);
  });

  it("waits for joined-member access sync after create, join and approval", () => {
    expect(persistence).toContain('if (input.visibility === "public") await syncTelegramAccess(id)');
    expect(persistence).toContain('if (result === "joined") await syncTelegramAccess(id)');
    expect(persistence).toContain("if (approved) await syncTelegramAccess(activityId, memberKey)");
  });
});
