import { describe, expect, it } from "vitest";
import { canPrepareBeautyTelegramShare, preparedTelegramBeautyShareEndpoint } from "./telegramPreparedBeautyShare";

describe("Beauty prepared Telegram share", () => {
  it("uses the same explicit Vercel transport pattern as Activity prepared share", () => {
    expect(preparedTelegramBeautyShareEndpoint).toBe("https://go-irl-1-1.vercel.app/api/telegram/prepared-beauty-share");
  });

  it("recognizes legacy and editable published Beauty links", () => {
    expect(canPrepareBeautyTelegramShare("https://go-irl-1-0.vercel.app/beauty/beauty-06b9689e8b1ee69a")).toBe(true);
    expect(canPrepareBeautyTelegramShare("https://goirl.example/beauty/beauty-test-studio")).toBe(true);
  });

  it("does not intercept ordinary event or malformed Beauty links", () => {
    expect(canPrepareBeautyTelegramShare("https://t.me/GOirl_bot?startapp=3b172dd9-d5e2-4328-86a4-d4107a6359fc")).toBe(false);
    expect(canPrepareBeautyTelegramShare("https://goirl.example/beauty/test-studio")).toBe(false);
    expect(canPrepareBeautyTelegramShare("https://go-irl-1-0.vercel.app/beauty/Test%20Studio")).toBe(false);
  });
});
