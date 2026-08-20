/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260812231500_account_facebook_identity_transfer.sql", import.meta.url),
  "utf8",
);
const edge = readFileSync(
  new URL("../supabase/functions/linkProviderIdentity/index.ts", import.meta.url),
  "utf8",
);
const webAuth = readFileSync(new URL("./auth/googleWebAuth.ts", import.meta.url), "utf8");
const webAuthFlow = readFileSync(new URL("./auth/webAuthFlow.ts", import.meta.url), "utf8");
const securityUi = readFileSync(new URL("./components/AccountSecuritySection.tsx", import.meta.url), "utf8");

describe("Facebook account identity transfer contract", () => {
  it("keeps the transfer RPC service-only and serialized", () => {
    expect(migration).toContain("create or replace function public.go_irl_transfer_facebook_identity");
    expect(migration).toContain("security definer");
    expect(migration).toContain("lock table public.user_provider_identities in share row exclusive mode");
    expect(migration).toContain("revoke execute on function public.go_irl_transfer_facebook_identity(text, text)");
    expect(migration).toContain("grant execute on function public.go_irl_transfer_facebook_identity(text, text)\nto service_role");
  });

  it("permits immutable onboarding cleanup only for the transaction-local transfer source", () => {
    expect(migration).toContain("go_irl.identity_transfer_source_user_key");
    expect(migration).toContain("perform set_config('go_irl.identity_transfer_source_user_key', v_source_user_key, true)");
  });

  it("only transfers an empty Facebook-primary duplicate account", () => {
    expect(migration).toContain("v_source.auth_provider <> 'facebook'");
    expect(migration).toContain("v_source.provider_user_id <> p_provider_binding_id");
    expect(migration).toContain("v_source.telegram_id is not null");
    expect(migration).toContain("public.activities where organizer_key = v_source_user_key");
    expect(migration).toContain("public.activity_members where user_key = v_source_user_key");
    expect(migration).toContain("public.beauty_bookings where client_user_key = v_source_user_key");
    expect(migration).toContain("public.user_profile_interests where user_key = v_source_user_key");
    expect(migration).toContain("request.kind <> 'account_deletion'");
    expect(migration).toContain("public.audit_log audit");
    expect(migration).toContain("return query select 'transfer_blocked'::text");
  });

  it("moves the Facebook binding atomically and scrubs only duplicate foundation", () => {
    expect(migration).toContain("update public.user_provider_identities\n  set user_key = p_target_user_key");
    expect(migration).toContain("delete from public.user_profiles where user_key = v_source_user_key");
    expect(migration).toContain("delete from public.user_handles where user_key = v_source_user_key");
    expect(migration).toContain("delete from public.user_onboarding_activations where user_key = v_source_user_key");
    expect(migration).toContain("delete from public.account_requests where user_key = v_source_user_key");
    expect(migration).toContain("delete from public.app_users where user_key = v_source_user_key");
    expect(migration).not.toContain("insert into public.deleted_provider_identities");
    expect(migration).not.toContain("account_deletion_receipts");
  });

  it("requires current GO IRL auth plus a fresh Facebook provider proof", () => {
    expect(edge).toContain("const goIrlToken = readBearerToken(request)");
    expect(edge).toContain("supabase.auth.getUser(providerAccessToken)");
    expect(edge).toContain("hashProviderIdentitySubject(provider, providerUserId)");
    expect(edge).toContain("go_irl_transfer_facebook_identity");
    expect(edge).toContain("identity_transfer_blocked");
    expect(edge).not.toContain("auth.admin.deleteUser");
  });

  it("uses an explicit second Facebook OAuth transfer flow in the UI", () => {
    expect(webAuthFlow).toContain('export type WebAuthMode = "sign-in" | "link" | "transfer"');
    expect(webAuth).toContain('resume.mode === "link" || resume.mode === "transfer"');
    expect(securityUi).toContain('const startTransfer = async (provider: WebTrustedIdentityProvider)');
    expect(securityUi).toContain('await beginWebAuth(provider, window.location.href, "transfer")');
    expect(securityUi).toContain('feedback.provider === provider');
    expect(securityUi).toContain('isWebAuthProviderEnabled("facebook")');
    expect(securityUi).toContain("transferConfirm");
  });
});
