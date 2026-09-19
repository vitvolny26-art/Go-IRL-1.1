import { readFileSync } from "node:fs";import { describe,expect,it } from "vitest";
const src=readFileSync(new URL("../supabase/functions/telegramEventSupergroup/cityPostersPublication.ts",import.meta.url),"utf8");
const prepared=readFileSync(new URL("../api/_shared/telegram-share-city-posters.ts",import.meta.url),"utf8");
const index=readFileSync(new URL("../supabase/functions/telegramEventSupergroup/index.ts",import.meta.url),"utf8");
const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20260918194500_akce001b_city_posters_telegram_publications.sql",import.meta.url),"utf8");
const scheduler=readFileSync(new URL("../supabase/migrations/20260919203000_akce001b_city_posters_maintenance_scheduler.sql",import.meta.url),"utf8");
const materializer=readFileSync(new URL("../supabase/migrations/20260919123000_akce001b_cinema_promotions_city_posters.sql",import.meta.url),"utf8");
const maintenanceApi=readFileSync(new URL("../api/city-posters/maintenance.ts",import.meta.url),"utf8");
describe("Akce001B Telegram City Posters publication",()=>{
 it("publishes one tracked canonical message with Details, Want-to-go and Share-post actions",()=>{expect(src).toContain("city_posters_telegram_publications");expect(src).toContain("reused:true");expect(src).toContain("inline_keyboard:[[");expect(src).toContain("cpplan:");expect(src).toContain("appendTelegramPostShareButton");expect(src).toContain("editMessageReplyMarkup");expect(src).not.toContain("activity_members")});
 it("maps Telegram identity into City Posters Planned instead of Activity membership",()=>{expect(src).toContain("resolveTelegramUser");expect(src).toContain('from("city_posters_user_plans")');expect(src).toContain("cpunplan:");expect(src).toContain("ephemeral_message_parameters")});
 it("uses the internal GO IRL event destination and Want-to-go callback in prepared shares",()=>{expect(prepared).toContain('https://t.me/GOirl_bot');expect(prepared).toContain('city-poster-${slug}');expect(prepared).toContain("callback_data: `cpplan:${card.eventId}`");expect(prepared).not.toContain("{ text: copy.open")});
 it("formats prepared all-day shares as a date range without midnight time",()=>{expect(prepared).toContain('starts_at,ends_at,timezone,occurrence_url,metadata');expect(prepared).toContain("occurrence.metadata?.allDay === true || occurrence.metadata?.all_day_campaign === true");expect(prepared).toContain("endsAt.getTime() - 1");expect(prepared).toContain("day: \"numeric\", month: \"long\", timeZone");expect(prepared).toContain("const caption = [card.title, card.description, card.date, card.venue]");});
 it("uses the Telegram Mini App destination in tracked group publications",()=>{expect(src).toContain("https://t.me/GOirl_bot?startapp=");expect(src).toContain("city-poster-${canonicalSlug}")});
 it("keeps City Posters start params out of the legacy Activity invitation parser",()=>{expect(app).toContain('startParam?.startsWith("city-poster-")');expect(app.indexOf('startParam?.startsWith("city-poster-")')).toBeLessThan(app.indexOf("parseInvitationStartParam(startParam)"))});
 it("requests Telegram communication consent after a new user plans the event",()=>{expect(src).toContain("planned&&resolved.isNew");expect(src).toContain("sendCommunicationVerificationRequests({supabase,telegramApi,userKeys:[resolved.userKey]})")});
 it("formats all-day promotion ranges as human dates without midnight timestamps",()=>{expect(src).toContain("formatAllDayRange");expect(src).toContain("exclusiveEnd.getTime()-86400000");expect(src).toContain('const caption=[event.title,event.description,dateRange]');expect(src).not.toContain('toLocaleTimeString');expect(src).not.toContain('00:00')});
 it("deletes tracked Telegram messages after expiry",()=>{expect(src).toContain('telegramApi("deleteMessage"');expect(src).toContain("maintainExpiredCityPosterPublications");expect(migration).toContain("expires_at timestamptz not null");expect(migration).toContain("deleted_at timestamptz")});
 it("wires webhook callback plus trusted-admin publication and service-role maintenance",()=>{expect(index).toContain("handleCityPostersPlanCallback");expect(index).toContain('publishCityPosterEvent');expect(index).toContain("verifyCityPostersPublisher");expect(index).toContain('["admin", "superadmin"]');expect(index).toContain("city_posters_publisher_required");expect(index).toContain('maintain_city_poster_publications');expect(index.indexOf('if (body.action === "maintain_city_poster_publications")')).toBeGreaterThan(index.indexOf("if (serviceRoleAuthorized && request.method === \"POST\")"));expect(index).toContain("publishDueCityPosterEvents");expect(src).toContain("export async function publishDueCityPosterEvents");expect(src).toContain('eq("status","published")')});
 it("reuses the canonical cinema promotion offer instead of accumulating inactive duplicates",()=>{expect(materializer).toContain("where id = (");expect(materializer).toContain("if not found then");expect(materializer).not.toContain("set active = false, updated_at = now()")});
 it("defines a protected daily-midnight scheduler using the existing worker secret",()=>{expect(scheduler).toContain("go-irl-city-posters-maintenance");expect(scheduler).toContain("'0 0 * * *'");expect(scheduler).toContain("go_irl_reminder_worker_secret");expect(scheduler).toContain("https://go-irl-1-1.vercel.app/api/city-posters/maintenance");expect(scheduler).not.toContain("functions/v1/telegramEventSupergroup");expect(scheduler).toContain("revoke all on function public.go_irl_configure_city_posters_maintenance_schedule()");expect(maintenanceApi).toContain("isReminderWorkerAuthorized(request)");expect(maintenanceApi).toContain('requireEnv("SUPABASE_SERVICE_ROLE_KEY")');expect(maintenanceApi).toContain('action: "maintain_city_poster_publications"')});
});
describe("Akce001B trusted City Posters publication client",()=> {
 it("uses the trusted session and never exposes service-role credentials",()=> {
  const client=readFileSync(new URL("./telegramEventSupergroup.ts",import.meta.url),"utf8");
  expect(client).toContain("export const publishCityPosterEvent");
  expect(client).toContain('action: "publish_city_poster_event"');
  expect(client).toContain("getTrustedAccessToken()");
  expect(client).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
 });
});
