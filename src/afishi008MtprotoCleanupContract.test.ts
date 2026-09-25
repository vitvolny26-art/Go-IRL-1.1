import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/city-posters-mtproto-delete.yml", import.meta.url),
  "utf8",
);
const cleanup = readFileSync(
  new URL("../scripts/city-posters-mtproto-delete.ts", import.meta.url),
  "utf8",
);

describe("AFISHI008 MTProto physical cleanup fallback", () => {
  it("keeps the production trigger exact, owner-gated and current-main pinned", () => {
    expect(workflow).toContain("github.event.issue.number == 1296");
    expect(workflow).toContain("github.event.comment.user.login == github.repository_owner");
    expect(workflow).toContain("startsWith(github.event.comment.body, '/city-posters-mtproto-delete ')");
    expect(workflow).toContain('test "$(git rev-parse origin/main)" = "$requested"');
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("deno-version: v2.9.7");
    expect(workflow).toContain("TELEGRAM_API_ID: ${{ secrets.TELEGRAM_API_ID }}");
    expect(workflow).toContain("TELEGRAM_API_HASH: ${{ secrets.TELEGRAM_API_HASH }}");
    expect(workflow).not.toContain("echo $TELEGRAM_BOT_TOKEN");
    expect(workflow).not.toContain("echo $TELEGRAM_API_HASH");
  });

  it("only targets an expired exact terminal ledger row", () => {
    expect(cleanup).toContain("publication.last_error?.startsWith(terminalPrefix)");
    expect(cleanup).toContain("publication.telegram_message_id !== expectedMessageId");
    expect(cleanup).toContain("publication.deleted_at !== null");
    expect(cleanup).toContain("expiresAtMs > Date.now()");
    expect(cleanup).toContain("resolveCityTelegramChatId(publication.city_id)");
    expect(cleanup).toContain("resolveCityTelegramUsername(publication.city_id)");
    expect(cleanup).toContain("publication.telegram_chat_id !== expectedChatId");
  });

  it("proves physical absence before reconciling the production ledger", () => {
    expect(cleanup).toContain("new TelegramClient({");
    expect(cleanup).toContain("storage: new MemoryStorage()");
    expect(cleanup).toContain("await telegram.start({ botToken: telegramBotToken })");
    expect(cleanup).toContain("await telegram.getChat(chatUsername)");
    expect(cleanup).toContain("chat.id !== expectedChatId");
    expect(cleanup).toContain("await telegram.getMessages(chat.id, [expectedMessageId])");
    expect(cleanup).toContain("await telegram.deleteMessagesById(chat.id, [expectedMessageId])");
    expect(cleanup).toContain("afishi008_mtproto_physical_delete_not_confirmed");
    expect(cleanup.indexOf("afishi008_mtproto_physical_delete_not_confirmed")).toBeLessThan(cleanup.indexOf('method: "PATCH"'));
    expect(cleanup).toContain('reconcileUrl.searchParams.set("telegram_message_id", `eq.${expectedMessageId}`)');
    expect(cleanup).toContain('reconcileUrl.searchParams.set("last_error", `eq.${publication.last_error}`)');
    expect(cleanup).toContain("body: JSON.stringify({ deleted_at: deletedAt, updated_at: deletedAt, last_error: null })");
    expect(cleanup).toContain("cleanup_result=ok event_id=");
  });

  it("pins the MTProto client libraries without persisting an authorization session", () => {
    expect(cleanup).toContain("jsr:@mtcute/core@0.32.2");
    expect(cleanup).toContain("jsr:@mtcute/deno@0.32.2");
    expect(cleanup).toContain("storage: new MemoryStorage()");
    expect(cleanup).toContain("await telegram.destroy()");
    expect(cleanup).not.toContain("StringSession");
  });
});
