import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const base = readFileSync(new URL("../api/_shared/telegram-city-publication-base.ts", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/telegramEventSupergroup/cityPublication.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../api/reminders/run.ts", import.meta.url), "utf8");

describe("ChRem002E delete-before-48h and anti-republish contract", () => {
  it("runs tracked-post cleanup before the messaging worker stages", () => {
    expect(base).toContain("deleteDueCanonicalCityActivityPosts");
    expect(base).toContain("cityTelegramPostDeleteAt");
    expect(base).toContain("cityTelegramPostDeleteWindowExpired");
    expect(base).toContain('telegramApi<boolean>("deleteMessage"');
    expect(worker).toContain("deleteDueCanonicalCityActivityPosts");
    expect(worker.indexOf("deleteDueCanonicalCityActivityPosts({")).toBeLessThan(worker.indexOf("runMessagingWorkerStages("));
  });

  it("persists deletion state and blocks later publication resurrection", () => {
    expect(base).toContain("deletedAt: now.toISOString()");
    expect(base).toContain('skipped: "deleted"');
    expect(base).toContain('skipped: "ended"');
    expect(edge).toContain("old?.activityId===a.id&&old.deletedAt");
    expect(edge).toContain('skipped:"deleted"');
    expect(edge).toContain('skipped:"ended"');
  });

  it("never turns Activity-post cleanup into topic deletion", () => {
    expect(base).not.toContain("deleteForumTopic");
  });
});
