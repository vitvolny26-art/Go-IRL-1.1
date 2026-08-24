import { describe, expect, it } from "vitest";
import telegramSource from "./telegram.ts?raw";

describe("Telegram Mini App native chat picker", () => {
  it("uses requestChat only on Telegram Mini Apps 9.6+ and never asks the user to paste a URL", () => {
    expect(telegramSource).toContain("requestChat?:");
    expect(telegramSource).toContain('isVersionAtLeast?.("9.6")');
    expect(telegramSource).toContain("webApp.requestChat(preparedButtonId");
    expect(telegramSource).toContain("telegram_chat_picker_unsupported");
  });
});
