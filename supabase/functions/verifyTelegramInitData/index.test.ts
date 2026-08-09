import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const invitationMigrationSource = readFileSync(
  new URL("../../migrations/20260731135251_admin005_role_invitations.sql", import.meta.url),
  "utf8",
);
const roleManagementMigrationSource = readFileSync(
  new URL("../../migrations/20260801001500_admin006_remove_professional_role.sql", import.meta.url),
  "utf8",
);

describe("Admin005 role invitation boundary", () => {
  it("allows creation only after current database admin-class verification", () => {
    const action = edgeSource.indexOf('action === "create_role_invitation"');
    const adminClassCheck = edgeSource.indexOf("if (!actorIsAdminClass)", action);
    const adminPromotionCheck = edgeSource.indexOf('if (targetRole === "admin" && actorRole !== "superadmin")', adminClassCheck);
    const tokenCreation = edgeSource.indexOf("createRoleInvitationToken()", adminPromotionCheck);
    expect(action).toBeGreaterThan(-1);
    expect(adminClassCheck).toBeGreaterThan(action);
    expect(adminPromotionCheck).toBeGreaterThan(adminClassCheck);
    expect(tokenCreation).toBeGreaterThan(adminPromotionCheck);
  });

  it("stores only a SHA-256 hash and keeps table access behind service-only RPCs", () => {
    expect(edgeSource).toContain("hashRoleInvitationToken(token)");
    expect(invitationMigrationSource).toContain("token_hash text not null unique");
    expect(invitationMigrationSource).not.toMatch(/\n\s*token\s+text/i);
    expect(invitationMigrationSource).toContain("grant execute on function public.go_irl_create_role_invitation");
  });

  it("keeps role start parameters out of activity invite claims", () => {
    expect(edgeSource).toContain("go_irl_start_param: roleInvitationToken ? null");
    expect(edgeSource).toContain("startParam: roleInvitationToken ? undefined : verified.startParam");
  });
});

describe("Admin006 role management boundary", () => {
  it("revalidates current admin-class role before listing and demotion", () => {
    const listAction = edgeSource.indexOf('action === "list_role_assignments"');
    const listAdminClassCheck = edgeSource.indexOf("if (!actorIsAdminClass)", listAction);
    const demoteAction = edgeSource.indexOf('action === "demote_role"');
    const demoteAdminClassCheck = edgeSource.indexOf("if (!actorIsAdminClass)", demoteAction);
    expect(listAction).toBeGreaterThan(-1);
    expect(listAdminClassCheck).toBeGreaterThan(listAction);
    expect(demoteAction).toBeGreaterThan(-1);
    expect(demoteAdminClassCheck).toBeGreaterThan(demoteAction);
  });

  it("uses service RPCs instead of direct client table mutation", () => {
    expect(edgeSource).toContain('rpc("go_irl_list_elevated_roles"');
    expect(edgeSource).toContain('rpc("go_irl_demote_role"');
    expect(edgeSource).not.toContain('.from("user_roles").update');
  });

  it("protects admin and records safe demotion audit metadata", () => {
    expect(roleManagementMigrationSource).toContain("v_previous_role not in ('organizer', 'professional', 'moderator')");
    expect(roleManagementMigrationSource).toContain("'user_role.demoted'");
    expect(roleManagementMigrationSource).toContain("'current_role', 'user'");
  });
});
