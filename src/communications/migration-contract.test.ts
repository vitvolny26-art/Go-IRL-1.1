import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260829130000_grooming018_communication_router.sql", import.meta.url), "utf8");

describe("GROOMING018 communication persistence contract", () => {
  it("keeps preferences owner-scoped and writes them through an authenticated RPC", () => {
    expect(migration).toContain("communication preferences own read");
    expect(migration).toContain("public.go_irl_auth_user_key()");
    expect(migration).toContain("go_irl_set_communication_preference");
    expect(migration).toContain("grant execute on function public.go_irl_set_communication_preference(text,uuid) to authenticated");
  });
  it("does not expose provider destinations through browser settings", () => {
    const settingsFunction = migration.slice(migration.indexOf("go_irl_get_communication_settings"), migration.indexOf("go_irl_set_communication_preference"));
    expect(settingsFunction).not.toContain("provider_user_id");
  });
  it("treats linked identities as candidate evidence, not readiness", () => {
    expect(migration).toContain("Linked identities are evidence only");
    expect(migration).toContain("else 'candidate' end");
  });
  it("allows only the server-side verification boundary to promote route readiness", () => {
    expect(migration).toContain("go_irl_update_communication_route");
    expect(migration).toContain("ready_route_requires_permission_and_capability");
    expect(migration).toContain("grant execute on function public.go_irl_update_communication_route(uuid,text,text[],text,text,text) to service_role");
  });
  it("removes auth-provider and last-inbound inferred selection from the claim boundary", () => {
    const claim = migration.slice(migration.indexOf("create or replace function public.go_irl_claim_event_notifications"));
    expect(claim).toContain("join public.communication_preferences preference");
    expect(claim).toContain("route.id = preference.primary_route_id");
    expect(claim).not.toContain("linked.provider = app_user.auth_provider");
    expect(claim).not.toContain("order by\n        (linked.provider");
    expect(claim).not.toContain("notification.provider = route.channel");
  });
  it("persists deterministic routing outcomes without changing business entities", () => {
    expect(migration).toContain("routing_outcome");
    expect(migration).toContain("selected_route_id");
    expect(migration).not.toContain("alter table public.beauty_bookings add column");
  });
  it("audits canonical user, intent, selected route, adapter and result", () => {
    expect(migration).toContain("communication_delivery_audit");
    expect(migration).toContain("user_key,intent_key,selected_route_id,adapter,attempt_number,result,sanitized_code");
    expect(migration).toContain("health_state = case when p_outcome = 'sent' then 'healthy'");
  });
  it("resolves 24h/3h reminders through the same explicit preference", () => {
    const reminderClaim = migration.slice(migration.indexOf("create or replace function public.go_irl_claim_due_event_reminders"), migration.indexOf("-- Replace inferred-provider selection"));
    expect(reminderClaim).toContain("route.id = preference.primary_route_id");
    expect(reminderClaim).toContain("provider = due.channel");
    expect(reminderClaim).not.toContain("where reminder.provider = any");
  });
});
