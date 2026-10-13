import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Activ020 decline delivery diagnostics", () => {
  it("only marks the organizer as notified after a matching Telegram receipt", async () => {
    const code = await readFile(new URL("../supabase/functions/telegramEventSupergroup/activ020InviteDecline.ts", import.meta.url), "utf8");
    const sentIndex = code.indexOf("const sent = await telegramApi");
    const receiptIndex = code.indexOf("sent.chat?.id !== organizerTelegramId");
    const markIndex = code.indexOf('organizer_notified_at: new Date().toISOString()');
    expect(sentIndex).toBeGreaterThan(0);
    expect(receiptIndex).toBeGreaterThan(sentIndex);
    expect(markIndex).toBeGreaterThan(receiptIndex);
    expect(code).toContain("activ020_decline_delivery_failed");
    expect(code).toContain("activ020_decline_organizer_telegram_unavailable");
    expect(code).toContain("activ020_decline_delivery_accepted");
    expect(code).toContain("if (!duplicate && inserted.data)");
  });
});
