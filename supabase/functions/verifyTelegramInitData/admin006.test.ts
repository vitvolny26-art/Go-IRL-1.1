import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const legacyMigrationSource = readFileSync(
  new URL("../../migrations/20260801001500_admin006_remove_professional_role.sql", import.meta.url),
  "utf8",
);
const superadminMigrationSource = readFileSync(
  new URL("../../migrations/20260809142500_superadmin_admin_role_management.sql", import.meta.url),
  "utf8",
);

describe("ADMIN006 role management boundary", () => {
  it("requires a current database admin-class role before list and mutation", () => {
    for (const actionName of ["create_role_invitation", "list_role_assignments", "demote_role"]) {
      const action = edgeSource.indexOf(`action === "${actionName}"`);
      const adminClassCheck = edgeSource.indexOf("if (!actorIsAdminClass)", action);
      expect(action).toBeGreaterThan(-1);
      expect(adminClassCheck).toBeGreaterThan(action);
    }
    expect(edgeSource).toContain('if (targetRole === "admin" && actorRole !== "superadmin")');
  });

  it("preserves the original elevated-role boundary as migration history", () => {
    expect(legacyMigrationSource).toContain("roles.role in ('organizer', 'professional', 'moderator', 'admin')");
    expect(legacyMigrationSource).toContain("limit 200");
    expect(legacyMigrationSource).toContain("go_irl_list_elevated_roles");
  });

  it("extends invitations and listings without allowing superadmin assignment", () => {
    expect(superadminMigrationSource).toContain("check (target_role in ('organizer', 'professional', 'admin'))");
    expect(superadminMigrationSource).toContain("p_target_role not in ('organizer', 'professional', 'admin')");
    expect(superadminMigrationSource).toContain("v_actor_role is null");
    expect(superadminMigrationSource).toContain("p_target_role = 'admin' and v_actor_role <> 'superadmin'");
    expect(superadminMigrationSource).toContain("roles.role in ('organizer', 'professional', 'moderator', 'admin', 'superadmin')");
    expect(superadminMigrationSource).not.toContain("target_role in ('organizer', 'professional', 'admin', 'superadmin')");
  });

  it("allows only superadmin to demote admin and protects superadmin", () => {
    expect(superadminMigrationSource).toContain("v_previous_role = 'superadmin'");
    expect(superadminMigrationSource).toContain("v_previous_role not in ('organizer', 'professional', 'moderator', 'admin')");
    expect(superadminMigrationSource).toContain("v_actor_role is null");
    expect(superadminMigrationSource).toContain("v_actor_role not in ('admin', 'superadmin')");
    expect(superadminMigrationSource).toContain("v_previous_role = 'admin' and v_actor_role <> 'superadmin'");
    expect(superadminMigrationSource).toContain("set role = 'user'");
    expect(superadminMigrationSource).toContain("'user_role.demoted'");
  });

  it("keeps all role-management RPCs service-role only", () => {
    expect(superadminMigrationSource).toContain("revoke execute on function public.go_irl_create_role_invitation(text, text, text, timestamptz)");
    expect(superadminMigrationSource).toContain("grant execute on function public.go_irl_create_role_invitation(text, text, text, timestamptz)");
    expect(superadminMigrationSource).toContain("revoke execute on function public.go_irl_list_elevated_roles()");
    expect(superadminMigrationSource).toContain("grant execute on function public.go_irl_list_elevated_roles()");
    expect(superadminMigrationSource).toContain("revoke execute on function public.go_irl_demote_role(text, text)");
    expect(superadminMigrationSource).toContain("grant execute on function public.go_irl_demote_role(text, text)");
  });
});
