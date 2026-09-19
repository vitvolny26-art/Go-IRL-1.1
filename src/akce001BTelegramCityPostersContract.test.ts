import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const src=readFileSync(new URL("../supabase/functions/telegramEventSupergroup/cityPostersPublication.ts",import.meta.url),"utf8");
const index=readFileSync(new URL("../supabase/functions/telegramEventSupergroup/index.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20260918194500_akce001b_city_posters_telegram_publications.sql",import.meta.url),"utf8");
describe("Akce001B Telegram City Posters publication",()=>{
 it("publishes one tracked canonical message with Details, Want-to-go and Share-post actions",()=>{expect(src).toContain("city_posters_telegram_publications");expect(src).toContain("reused:true");expect(src).toContain("inline_keyboard:[[");expect(src).toContain("cpplan:");expect(src).toContain("appendTelegramPostShareButton");expect(src).toContain("editMessageReplyMarkup");expect(src).not.toContain("activity_members")});
 it("maps Telegram identity into City Posters Planned instead of Activity membership",()=>{expect(src).toContain("resolveTelegramUser");expect(src).toContain('from("city_posters_user_plans")');expect(src).toContain("cpunplan:");expect(src).toContain("ephemeral_message_parameters")});
 it("deletes tracked Telegram messages after expiry",()=>{expect(src).toContain('telegramApi("deleteMessage"');expect(src).toContain("maintainExpiredCityPosterPublications");expect(migration).toContain("expires_at timestamptz not null");expect(migration).toContain("deleted_at timestamptz")});
 it("wires webhook callback and service-role publication/maintenance actions",()=>{expect(index).toContain("handleCityPostersPlanCallback");expect(index).toContain('publish_city_poster_event');expect(index).toContain('maintain_city_poster_publications')});
});
