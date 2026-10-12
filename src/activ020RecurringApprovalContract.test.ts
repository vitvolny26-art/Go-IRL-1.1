import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const recurring = readFileSync(new URL("../supabase/functions/telegramEventSupergroup/recurringInviteAutomation.ts", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261012110000_activ020_recurring_invite_approvals.sql", import.meta.url), "utf8");

describe("Activ020 recurring Telegram invitations require owner approval", () => {
  it("does not create an occurrence or send invitations before approval", () => {
    expect(recurring).toContain('approval.status === "pending"');
    expect(recurring).toContain('approval.status === "prompted"');
    expect(recurring).toContain('approval.status === "skipped"');
    expect(recurring.indexOf('if (approval.status !== "same" && approval.status !== "none")'))
      .toBeLessThan(recurring.indexOf("const next = await createOrLoadNextActivity", recurring.indexOf("export const materializeDueRecurringInviteActivities")));
  });

  it("repeats only saved prior recipients, not arbitrary joined members", () => {
    expect(recurring).toContain("source.metadata?.initialInviteUserKeys");
    expect(recurring).toContain("new Set(previousTargets)");
    expect(recurring).not.toContain('supabase.from("activity_members")\n    .select("user_key,display_name")');
  });

  it("binds each recurrence approval to its organizer and occurrence date", () => {
    expect(migration).toContain("unique (source_activity_id,next_event_date)");
    expect(migration).toContain("revoke all on public.activity_recurring_invite_approvals from public,anon,authenticated");
    expect(recurring).toContain('.eq("organizer_key", userKey).eq("status", "prompted")');
    expect(webhook).toContain("handleActiv020RecurringApprovalCallback");
  });
});
