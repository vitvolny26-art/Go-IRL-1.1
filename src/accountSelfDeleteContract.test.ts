/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260812210757_account_self_delete_contract.sql", import.meta.url),
  "utf8",
);
const authResolutionMigration = readFileSync(
  new URL("../supabase/migrations/20260815133000_account_self_delete_auth_resolution.sql", import.meta.url),
  "utf8",
);
const accountRequest = readFileSync(
  new URL("../supabase/functions/accountRequest/index.ts", import.meta.url),
  "utf8",
);

describe("account self-delete contract", () => {
  it("keeps tombstones and cleanup receipts service-only behind RLS", () => {
    expect(migration).toContain("create table if not exists public.deleted_provider_identities");
    expect(migration).toContain("create table if not exists public.account_deletion_receipts");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.deleted_provider_identities from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.deleted_provider_identities to service_role");
  });

  it("opens immutable onboarding deletion only for the transaction-local self-delete key", () => {
    expect(migration).toContain("current_setting('go_irl.self_delete_user_key', true) = old.user_key");
    expect(migration).toContain("perform set_config('go_irl.self_delete_user_key', p_user_key, true)");
  });

  it("fails closed for elevated or owner-obligation accounts", () => {
    expect(migration).toContain("coalesce(v_role, 'user') <> 'user'");
    expect(migration).toContain("public.activities where organizer_key = p_user_key");
    expect(migration).toContain("public.beauty_professional_profiles where owner_user_key = p_user_key");
    expect(migration).toContain("account_deletion_owner_obligations");
  });

  it("scrubs user-owned data before deleting app_users", () => {
    expect(migration).toContain("delete from public.activity_chat_messages where sender_user_key = p_user_key");
    expect(migration).toContain("delete from public.user_profiles where user_key = p_user_key");
    expect(migration).toContain("delete from public.user_provider_identities where user_key = p_user_key");
    expect(migration).toContain("delete from public.app_users where user_key = p_user_key");
  });

  it("resolves Supabase Auth users directly before scrub and persists cleanup work atomically", () => {
    expect(accountRequest).toContain('supabase.rpc("go_irl_resolve_auth_cleanup"');
    expect(accountRequest).not.toContain("supabase.auth.admin.listUsers");
    expect(accountRequest).toContain("p_auth_cleanup: authCleanup");
    expect(accountRequest).toContain("supabase.auth.admin.deleteUser");
    expect(accountRequest).toContain("cleanupPending");
  });

  it("keeps direct Auth identity resolution service-role-only and fails closed", () => {
    expect(authResolutionMigration).toContain("join auth.identities as identity");
    expect(authResolutionMigration).toContain("identity.provider_id = requested.subject");
    expect(authResolutionMigration).toContain("security definer");
    expect(authResolutionMigration).toContain("set search_path = ''");
    expect(authResolutionMigration).toContain(
      "revoke all on function public.go_irl_resolve_auth_cleanup(jsonb) from public, anon, authenticated",
    );
    expect(authResolutionMigration).toContain(
      "grant execute on function public.go_irl_resolve_auth_cleanup(jsonb) to service_role",
    );
    expect(authResolutionMigration).toContain("account_deletion_auth_resolution_failed");
  });

  it("records bounded self-delete failure stages without logging identity subjects", () => {
    for (const stage of [
      "identity_lookup",
      "provider_tombstones",
      "auth_resolution",
      "storage_list",
      "scrub_rpc",
      "finalize_cleanup",
    ]) {
      expect(accountRequest).toContain(`requestStage = "${stage}"`);
    }
    expect(accountRequest).toContain('console.error("account_request_failed", {');
    expect(accountRequest).not.toContain("provider_user_id: appUserResult.data.provider_user_id");
  });
});
