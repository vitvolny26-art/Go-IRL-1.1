import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Activ020 create-before-share integration contract", () => {
  it("persists an Activity before opening Telegram and never waits for the native share callback", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const submitStart = source.indexOf("      let id: string;");
    const save = source.indexOf("id = await createActivity(activity);", submitStart);
    const share = source.indexOf("webApp.openTelegramLink(shareUrl)", submitStart);
    expect(submitStart).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(submitStart);
    expect(share).toBeGreaterThan(save);
    expect(source).not.toContain("deliverPreparedActivityInvite(");
    expect(source).not.toContain("createHiddenActivityInviteDraft(");
  });
});
