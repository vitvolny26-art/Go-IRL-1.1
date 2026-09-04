import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260904043000_postevent001_telegram_primary_route_fix.sql", import.meta.url),
  "utf8",
);

const postEventKinds = [
  "post_event.organizer_confirmation",
  "post_event.participant_confirmation",
] as const;

describe("POSTEVENT001 Telegram-primary notification routing", () => {
  it("targets only the two POSTEVENT001 interaction notification kinds", () => {
    for (const kind of postEventKinds) expect(migration).toContain(`'${kind}'`);
    expect(migration).not.toContain("post_event.rate_event'\n      and 'telegram'");
    expect(migration).not.toContain("post_event.leave_review'\n      and 'telegram'");
  });

  it("selects Telegram only when the route and identity are executable", () => {
    const telegramBranch = migration.slice(
      migration.indexOf("-- POSTEVENT001: select Telegram directly"),
      migration.indexOf("union all", migration.indexOf("-- POSTEVENT001: select Telegram directly")),
    );
    expect(telegramBranch).toContain("telegram_route.channel = 'telegram'");
    expect(telegramBranch).toContain("identity.provider = 'telegram'");
    expect(telegramBranch).toContain("identity.status = 'active'");
    expect(telegramBranch).toContain("telegram_route.readiness = 'ready'");
    expect(telegramBranch).toContain("telegram_route.consent_state = 'granted'");
    expect(telegramBranch).toContain("telegram_route.health_state in ('unknown','healthy')");
    expect(telegramBranch).toContain("telegram_route.capabilities @> array['outbound','notification']::text[]");
    expect(telegramBranch).toContain("'telegram' = any(p_providers)");
    expect(telegramBranch).not.toContain("preference.primary_route_id");
  });

  it("uses in-app as POSTEVENT fallback only when executable Telegram is unavailable", () => {
    const fallback = migration.slice(
      migration.indexOf("-- POSTEVENT001 is a kind-level channel policy"),
      migration.indexOf("-- Preserve the existing generic in-app primary-route behavior"),
    );
    expect(fallback).toContain("routing_outcome = 'in_app'");
    expect(fallback).toContain("in_app_route.channel = 'in_app'");
    expect(fallback).toContain("and not (");
    expect(fallback).toContain("'telegram' = any(p_providers)");
    expect(fallback).toContain("exists (");
    expect(fallback).toContain("telegram_route.channel = 'telegram'");
  });

  it("preserves the generic primary-route contract outside POSTEVENT001", () => {
    const genericBranch = migration.slice(
      migration.indexOf("-- All unrelated notification kinds retain"),
      migration.indexOf("), locked_due as"),
    );
    expect(genericBranch).toContain("join public.communication_preferences preference");
    expect(genericBranch).toContain("route.id = preference.primary_route_id");
    expect(genericBranch).toContain("notification.kind not in (");
    for (const kind of postEventKinds) expect(genericBranch).toContain(`'${kind}'`);
  });

  it("does not change reminder routing or create a second queue or worker", () => {
    expect(migration).not.toContain("go_irl_claim_due_event_reminders");
    expect(migration).not.toContain("create table");
    expect(migration).not.toContain("create trigger");
  });
});
