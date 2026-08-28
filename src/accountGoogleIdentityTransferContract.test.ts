/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260828060900_account_google_identity_transfer_residual_state.sql", import.meta.url),
  "utf8",
);
const edge = readFileSync(
  new URL("../supabase/functions/linkProviderIdentity/index.ts", import.meta.url),
  "utf8",
);
const webAuth = readFileSync(new URL("./auth/googleWebAuth.ts", import.meta.url), "utf8");
const securityUi = readFileSync(new URL("./components/AccountSecuritySection.tsx", import.meta.url), "utf8");

describe("Google account identity transfer contract", () => {
  it("keeps the Google transfer RPC service-only and serialized", () => {
    expect(migration).toContain("create or replace function public.go_irl_transfer_google_identity");
    expect(migration).toContain("security definer");
    expect(migration).toContain("lock table public.user_provider_identities in share row exclusive mode");
    expect(migration).toContain("revoke execute on function public.go_irl_transfer_google_identity(text, text)");
    expect(migration).toContain("grant execute on function public.go_irl_transfer_google_identity(text, text)\nto service_role");
  });

  it("only transfers a standard Google-primary duplicate with the exact active identity", () => {
    expect(migration).toContain("v_source.auth_provider <> 'google'");
    expect(migration).toContain("v_source.provider_user_id <> p_provider_binding_id");
    expect(migration).toContain("v_source.telegram_id is not null");
    expect(migration).toContain("identity.provider = 'google'");
    expect(migration).toContain("and identity.status = 'active'");
    expect(migration).toContain("return query select 'transfer_blocked'::text");
  });

  it("fails closed on meaningful source account state including current Beauty waitlist data", () => {
    expect(migration).toContain("public.activities where organizer_key = v_source_user_key");
    expect(migration).toContain("public.activity_members where user_key = v_source_user_key");
    expect(migration).toContain("public.activity_chat_messages where sender_user_key = v_source_user_key");
    expect(migration).toContain("public.beauty_bookings where client_user_key = v_source_user_key");
    expect(migration).toContain("public.beauty_booking_waitlist_entries where client_user_key = v_source_user_key");
    expect(migration).toContain("public.user_profile_interests where user_key = v_source_user_key");
    expect(migration).toContain("request.kind <> 'account_deletion'");
    expect(migration).toContain("public.audit_log audit");
  });

  it("permits only the bounded residual membership notification and audit pair", () => {
    expect(migration).toContain("v_notification_count > 1");
    expect(migration).toContain("notification.kind = 'join_confirmed'");
    expect(migration).toContain("notification.status = 'scheduled'");
    expect(migration).toContain("notification.attempt_count = 0");
    expect(migration).toContain("notification.leased_at is null");
    expect(migration).toContain("notification.sent_at is null");
    expect(migration).toContain("notification.provider is null");
    expect(migration).toContain("v_audit_count not in (0, 2)");
    expect(migration).toContain("v_audit_insert_count <> 1");
    expect(migration).toContain("v_audit_delete_count <> 1");
    expect(migration).toContain("audit.entity_type = 'activity_member'");
    expect(migration).toContain("audit.action in ('activity_member.insert', 'activity_member.delete')");
    expect(migration).toContain("audit.metadata ->> 'member_user_key' = v_source_user_key");
    expect(migration).toContain("delete from public.event_notifications notification");
    expect(migration).toContain("update public.audit_log audit\n  set actor_user_key = p_target_user_key");
    expect(migration).toContain("jsonb_set(audit.metadata, '{member_user_key}', to_jsonb(p_target_user_key), false)");
  });

  it("does not use email or phone as an account merge signal", () => {
    expect(migration).not.toMatch(/\bemail\b/i);
    expect(migration).not.toMatch(/\bphone\b/i);
    expect(edge).not.toMatch(/\.eq\(["'](?:email|phone)["']/i);
  });

  it("moves only the Google binding and preserves tombstone semantics", () => {
    expect(migration).toContain("update public.user_provider_identities\n  set user_key = p_target_user_key");
    expect(migration).toContain("where provider = 'google'");
    expect(migration).toContain("delete from public.app_users where user_key = v_source_user_key");
    expect(migration).not.toContain("insert into public.deleted_provider_identities");
    expect(migration).not.toContain("delete from public.deleted_provider_identities");
    expect(edge).toContain('const canRelinkDeletedGoogle = body.action === "link" && provider === "google";');
    expect(edge).toContain('if (deletedIdentityResult.data && !canRelinkDeletedGoogle) return json({ error: "account_deleted" }, 410);');
  });

  it("requires the trusted GO IRL session and a fresh Google OAuth proof", () => {
    expect(edge).toContain("const goIrlToken = readBearerToken(request)");
    expect(edge).toContain('claims.iss !== "go-irl-supabase-edge"');
    expect(edge).toContain("supabase.auth.getUser(providerAccessToken)");
    expect(edge).toContain("readProviderSubject(candidateResult.data.user.identities, provider)");
    expect(edge).toContain('? "go_irl_transfer_google_identity"');
    expect(edge).toContain("identity_transfer_blocked");
  });

  it("uses an explicit second Google OAuth proof instead of silent account merging", () => {
    expect(webAuth).toContain('resume.mode === "link" || resume.mode === "transfer"');
    expect(webAuth).toContain('body: JSON.stringify({ provider, action: resume.mode })');
    expect(securityUi).toContain('beginWebAuth(provider, window.location.href, "transfer")');
    expect(securityUi).toContain('feedback.provider === "google" ? t.googleConflict : t.facebookConflict');
    expect(securityUi).toContain('feedback.provider === provider');
  });
});
