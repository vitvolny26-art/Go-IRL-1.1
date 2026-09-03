import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSource = readFileSync(
  new URL("../../supabase/migrations/20260903120000_grooming018j_beauty_cabinet_lifecycle.sql", import.meta.url),
  "utf8",
);
const verifySource = readFileSync(
  new URL("../../supabase/verify_grooming018j_beauty_cabinet_lifecycle.sql", import.meta.url),
  "utf8",
);
const designSource = readFileSync(
  new URL("../../docs/design/2026-09-03-grooming018j-beauty-cabinet-lifecycle.md", import.meta.url),
  "utf8",
);

describe("GROOMING018-J Beauty cabinet lifecycle source contract", () => {
  it("stores only durable management authority and derives handoff_pending", () => {
    expect(migrationSource).toContain("management_state text not null default 'master_managed'");
    expect(migrationSource).toContain("check (management_state in ('platform_managed', 'master_managed'))");
    expect(migrationSource).not.toContain("management_state in ('platform_managed', 'handoff_pending', 'master_managed')");
    expect(migrationSource).toContain("then 'handoff_pending'::text");
    expect(migrationSource).toContain("transfer.transfer_kind = 'platform_handoff'");
    expect(migrationSource).toContain("transfer.expires_at > now()");
  });

  it("does not silently classify existing cabinets as platform-managed", () => {
    expect(migrationSource).not.toContain("update public.beauty_professional_profiles\nset management_state = 'platform_managed'");
    expect(designSource).toContain("Existing profiles are NOT silently classified as `platform_managed`");
    expect(designSource).toContain("later explicit production-data adoption gate");
  });

  it("keeps superadmin editing service-role-only and non-impersonating", () => {
    for (const signature of [
      "public.go_irl_admin_list_beauty_workspaces(text)",
      "public.go_irl_admin_get_beauty_workspace(uuid,text)",
      "public.go_irl_admin_save_beauty_workspace(uuid,jsonb,timestamptz,text)",
      "public.go_irl_admin_adopt_beauty_workspace(uuid,timestamptz,text)",
      "public.go_irl_prepare_beauty_platform_handoff(uuid,text,timestamptz,text)",
    ]) {
      expect(migrationSource).toContain(`revoke all on function ${signature} from public, anon, authenticated;`);
      expect(migrationSource).toContain(`grant execute on function ${signature} to service_role;`);
    }

    const saveStart = migrationSource.indexOf("create or replace function public.go_irl_admin_save_beauty_workspace");
    const saveEnd = migrationSource.indexOf("create or replace function public.go_irl_admin_adopt_beauty_workspace", saveStart);
    const saveSource = migrationSource.slice(saveStart, saveEnd);
    expect(saveSource).toContain("perform public.go_irl_beauty_assert_superadmin(p_superadmin_user_key)");
    expect(saveSource).toContain("p_expected_updated_at is null");
    expect(saveSource).toContain("'beauty_workspace_admin.saved'");
    expect(saveSource).not.toContain("set owner_user_key =");
    expect(saveSource).not.toContain("set management_state =");
    expect(designSource).toContain("No professional impersonation");
  });

  it("auto-approves only superadmin-prepared platform handoff on trusted candidate claim", () => {
    expect(migrationSource).toContain("transfer_kind text not null default 'owner_transfer'");
    expect(migrationSource).toContain("initiated_by_superadmin_user_key text references public.app_users(user_key)");
    expect(migrationSource).toContain("'platform_handoff'");

    const claimStart = migrationSource.indexOf("create or replace function public.go_irl_claim_beauty_workspace_owner_transfer");
    const claimEnd = migrationSource.indexOf("create or replace function public.go_irl_decide_beauty_workspace_owner_transfer", claimStart);
    const claimSource = migrationSource.slice(claimStart, claimEnd);
    expect(claimSource).toContain("if v_transfer.transfer_kind = 'platform_handoff' then");
    expect(claimSource).toContain("owner_user_key = p_candidate_user_key");
    expect(claimSource).toContain("management_state = 'master_managed'");
    expect(claimSource).toContain("decided_by_user_key = v_transfer.initiated_by_superadmin_user_key");
    expect(claimSource).toContain("'beauty_workspace_platform_handoff.approved'");
    expect(claimSource).toContain("return query select 'approved'::text");
  });

  it("preserves master-to-master transfer approval and blocks technical platform owners from starting it", () => {
    const requestStart = migrationSource.indexOf("create or replace function public.go_irl_request_beauty_workspace_owner_transfer");
    const requestEnd = migrationSource.indexOf("create or replace function public.go_irl_claim_beauty_workspace_owner_transfer", requestStart);
    const requestSource = migrationSource.slice(requestStart, requestEnd);
    expect(requestSource).toContain("v_profile.management_state <> 'master_managed'");
    expect(requestSource).toContain("return query select 'platform_managed'::text");
    expect(requestSource).toContain("'owner_transfer'");

    const claimStart = migrationSource.indexOf("create or replace function public.go_irl_claim_beauty_workspace_owner_transfer");
    const claimEnd = migrationSource.indexOf("create or replace function public.go_irl_decide_beauty_workspace_owner_transfer", claimStart);
    const claimSource = migrationSource.slice(claimStart, claimEnd);
    expect(claimSource).toContain("set state = 'pending_superadmin'");
    expect(claimSource).toContain("return query select 'pending_superadmin'::text");

    const decideSource = migrationSource.slice(claimEnd);
    expect(decideSource).toContain("v_transfer.transfer_kind <> 'owner_transfer'");
    expect(decideSource).toContain("management_state = 'master_managed'");
  });

  it("ships a structural verification contract for grants, CAS, derived lifecycle and atomic handoff", () => {
    expect(verifySource).toContain("grooming018j_beauty_cabinet_lifecycle_structural_verification_passed");
    expect(verifySource).toContain("admin RPC leaked to authenticated");
    expect(verifySource).toContain("service-role RPC grant missing");
    expect(verifySource).toContain("derived handoff lifecycle contract missing");
    expect(verifySource).toContain("atomic platform handoff / legacy owner-transfer split incomplete");
    expect(verifySource).toContain("admin save authorization/CAS/audit/non-impersonation contract incorrect");
  });

  it("keeps synthetic booking test-mode out of the lifecycle migration until downstream suppression exists", () => {
    expect(migrationSource).not.toContain("is_admin_test");
    expect(migrationSource).not.toContain("go_irl_admin_create_beauty_test_booking");
    expect(designSource).toContain("production-safe `Тестировать` action is intentionally NOT mixed into this migration");
    expect(designSource).toContain("Google Calendar sync");
    expect(designSource).toContain("Telegram / Meta outbound");
  });
});
