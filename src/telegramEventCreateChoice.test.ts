import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("event creation Telegram choice", () => {
  it("requires an explicit yes/no choice and auto-creates a forum topic on yes", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain('name="telegramChatChoice"');
    expect(source).toContain('value="yes" required');
    expect(source).toContain('value="no" required');
    expect(source).toContain('telegramChatChoice === "yes"');
    expect(source).toContain("await createEventForumTopic(id)");
    expect(source).toContain("telegramSetupFailed");
  });
});
