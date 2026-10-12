/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const types = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
const worker = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/recurringInviteAutomation.ts", import.meta.url),
  "utf8",
);
const edge = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url),
  "utf8",
);

describe("Activ020 recurring invite-only automation contract", () => {
  it("stores the organizer opt-in on the created invite-only Activity instead of materializing a legacy series", () => {
    expect(app).toContain('name="recurringInviteAutomation"');
    expect(app).toContain('visibility === "invite"');
    expect(app).toContain("leadDays: 2 as const");
    expect(app).toContain('} else if (recurringInviteAutomation) {');
    expect(app).toContain("id = await createActivity(activity);");
    expect(types).toContain("recurringInvite?: RecurringInviteAutomationMetadata");
  });

  it("creates the next occurrence one week later only when its two-day lead window is due", () => {
    expect(worker).toContain("const nextDate = shiftIsoDate(source.event_date, 7)");
    expect(worker).toContain("const dueDate = shiftIsoDate(nextDate, -config.leadDays)");
    expect(worker).toContain("if (today < dueDate || nextDate < today) continue");
    expect(worker).toContain("deterministicOccurrenceId");
    expect(worker).toContain('visibility: "invite"');
  });

  it("reuses only recorded invitees after organizer approval", () => {
    expect(worker).toContain("source.metadata?.initialInviteUserKeys");
    expect(worker).toContain("userKey !== source.organizer_key");
    expect(worker).toContain('approval.status === "same"');
    expect(worker).toContain('.eq("provider", "telegram")');
    expect(worker).toContain('"sendMessage"');
    expect(worker).toContain("invitedUserKeys");
  });

  it("reuses the existing service-role repeat worker entrypoint with a separate approval migration", () => {
    expect(edge).toContain("materializeDueRecurringInviteActivities");
    expect(edge).toContain('body.action === "send_repeat_publication_prompts"');
    expect(edge).toContain("recurringInvites");
    expect(worker).not.toContain("create table");
    expect(worker).toContain("activity_recurring_invite_approvals");
  });
});
