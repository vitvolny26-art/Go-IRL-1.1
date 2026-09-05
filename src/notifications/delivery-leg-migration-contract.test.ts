import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260905043000_unified_notification_delivery_legs.sql", import.meta.url),
  "utf8",
);

describe("M1 unified notification delivery legs migration contract", () => {
  it("keeps existing notifications on the legacy single-route path", () => {
    expect(migration).toContain("delivery_mode text not null default 'legacy_single_route'");
    expect(migration).toContain("delivery_mode in ('legacy_single_route','multi_leg')");
    expect(migration.match(/notification\.delivery_mode = 'legacy_single_route'/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
  });

  it("adds one logical reminder identity with independent delivery legs", () => {
    expect(migration).toContain("logical_intent_key text");
    expect(migration).toContain("event_notifications_logical_intent_uidx");
    expect(migration).toContain("create table if not exists public.notification_delivery_legs");
    expect(migration).toContain("notification_delivery_legs_one_in_app_uidx");
    expect(migration).toContain("notification_delivery_legs_one_active_external_uidx");
  });

  it("keeps delivery legs owner-readable but service-controlled", () => {
    expect(migration).toContain('notification delivery legs own read');
    expect(migration).toContain("notification.user_key = (select public.go_irl_auth_user_key())");
    expect(migration).toContain("revoke insert, update, delete on public.notification_delivery_legs from anon, authenticated");
  });

  it("validates parent, route ownership and executable route state", () => {
    expect(migration).toContain("multi_leg_notification_required");
    expect(migration).toContain("delivery_leg_route_owner_mismatch");
    expect(migration).toContain("delivery_leg_channel_mismatch");
    expect(migration).toContain("communication_route_not_executable");
  });

  it("claims only external multi-leg deliveries and preserves terminal failures", () => {
    const claim = migration.slice(migration.indexOf("public.go_irl_claim_notification_delivery_legs"));
    expect(claim).toContain("leg.leg_type = 'external'");
    expect(claim).toContain("for update of leg skip locked");
    expect(claim).toContain("leg.status = 'failed' and leg.next_attempt_at is not null");
    expect(claim).not.toContain("leg.status in ('scheduled','failed')");
  });

  it("finishes only claimed legs and records existing communication audit evidence", () => {
    expect(migration).toContain("delivery_leg_not_claimed");
    expect(migration).toContain("communication_delivery_audit");
    expect(migration).toContain("on conflict (intent_key, attempt_number) do nothing");
  });

  it("does not switch producers, preferences or the runtime repository", () => {
    expect(migration).not.toContain("create trigger activity_members");
    expect(migration).not.toContain("beauty_booking_events");
    expect(migration).not.toContain("update public.communication_preferences");
  });
});
