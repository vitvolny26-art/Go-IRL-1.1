import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("event communication opt-in choices", () => {
  it("requires independent GO IRL chat and Telegram topic choices and creates only explicit yes selections", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

    expect(source).toContain('name="activityChatChoice"');
    expect(source).toContain('name="telegramTopicChoice"');
    expect(source).toContain('value="yes" required');
    expect(source).toContain('value="no" required');
    expect(source).toContain('activityChatChoice === "yes"');
    expect(source).toContain('telegramTopicChoice === "yes"');
    expect(source).toContain("await ensureActivityChat(id)");
    expect(source).toContain("await createEventForumTopic(id)");
    expect(source).toContain("Record<UiLanguage");
    for (const language of ["ru", "uk", "cs", "en", "pl", "sk"]) {
      expect(source).toContain(`${language}: {`);
    }
  });
});
