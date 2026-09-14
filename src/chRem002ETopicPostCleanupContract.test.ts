import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const callbackBase = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/postEventCallbackBase.ts", import.meta.url),
  "utf8",
);

describe("ChRem002E organizer topic-post cleanup contract", () => {
  it("deletes the tracked Activity post only after durable organizer survey completion", () => {
    expect(callbackBase).toContain('state.nextStep === "complete"');
    expect(callbackBase).toContain("cleanupCompletedActivityTopicPost");
    expect(callbackBase).toContain('telegramApi<boolean>("deleteMessage"');
    expect(callbackBase).toContain("cityTelegramPublication");
    expect(callbackBase).toContain("active: false");
    expect(callbackBase).toContain("deletedAt");
  });

  it("keeps Activity-post cleanup separate from Telegram topic deletion", () => {
    expect(callbackBase).not.toContain("deleteForumTopic");
    expect(callbackBase).not.toContain("topic_deleted_at");
  });

  it("keeps cleanup best-effort after durable survey truth", () => {
    expect(callbackBase).toContain('reason: "telegram_delete_failed"');
    expect(callbackBase).toContain('reason: "metadata_update_failed"');
    expect(callbackBase).toContain("activityPostCleanup");
    expect(callbackBase).not.toContain("throw new Error(\"chrem002e");");
  });
});
