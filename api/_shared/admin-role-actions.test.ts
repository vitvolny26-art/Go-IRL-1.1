import { describe, expect, it, vi } from "vitest";
import {
  executeAdminRoleAction,
  type AdminRoleActionDependencies,
} from "./admin-role-actions.js";
import type { AuthorizedAdmin } from "./admin-authorization.js";

const admin: AuthorizedAdmin = {
  ok: true,
  userKey: "telegram:100",
  subject: "00000000-0000-4000-8000-000000000001",
  role: "admin",
};
const superadmin: AuthorizedAdmin = { ...admin, role: "superadmin" };
const activityId = "11f4dc06-3f32-4b63-93f9-7e4e4d1f7f85";

const dependencies = (overrides: Partial<AdminRoleActionDependencies> = {}): AdminRoleActionDependencies => ({
  createInvitation: vi.fn(async (_actorUserKey, targetRole) => ({ id: "invitation-id", startParam: `ri_${"a".repeat(43)}`, targetRole, expiresAt: "2026-08-29T00:00:00.000Z" })),
  listAssignments: vi.fn(async () => [{ user_key: "telegram:200", role: "organizer" }]),
  demoteRole: vi.fn(async () => ({ status: "updated", previous_role: "organizer", current_role: "user" })),
  reassignOrganizer: vi.fn(async () => ({ status: 200, payload: { activityOrganizerReassignment: { status: "updated" } } })),
  ...overrides,
});

describe("admin role actions", () => {
  it("keeps admin invitation privilege bounded", async () => {
    const deps = dependencies();
    await expect(executeAdminRoleAction(admin, { action: "create_role_invitation", targetRole: "admin" }, deps))
      .resolves.toEqual({ status: 403, payload: { error: "access_denied" } });
    expect(deps.createInvitation).not.toHaveBeenCalled();

    await expect(executeAdminRoleAction(superadmin, { action: "create_role_invitation", targetRole: "admin" }, deps))
      .resolves.toMatchObject({ status: 201, payload: { invitation: { targetRole: "admin" } } });
  });

  it("allows admin-class role listing and demotion", async () => {
    const deps = dependencies();
    await expect(executeAdminRoleAction(admin, { action: "list_role_assignments" }, deps))
      .resolves.toMatchObject({ status: 200, payload: { roleAssignments: [{ role: "organizer" }] } });
    await expect(executeAdminRoleAction(admin, { action: "demote_role", targetUserKey: "telegram:200" }, deps))
      .resolves.toMatchObject({ status: 200, payload: { roleDemotion: { status: "updated" } } });
  });

  it("rejects malformed demotion targets before mutation", async () => {
    const deps = dependencies();
    await expect(executeAdminRoleAction(admin, { action: "demote_role", targetUserKey: "200" }, deps))
      .resolves.toEqual({ status: 400, payload: { error: "invalid_target_user_key" } });
    expect(deps.demoteRole).not.toHaveBeenCalled();
  });

  it("requires exact superadmin for organizer reassignment", async () => {
    const deps = dependencies();
    await expect(executeAdminRoleAction(admin, {
      action: "reassign_activity_organizer",
      activityId,
      targetUserKey: "telegram:200",
    }, deps)).resolves.toEqual({ status: 403, payload: { error: "access_denied" } });
    expect(deps.reassignOrganizer).not.toHaveBeenCalled();

    await expect(executeAdminRoleAction(superadmin, {
      action: "reassign_activity_organizer",
      activityId,
      targetUserKey: "telegram:200",
    }, deps)).resolves.toMatchObject({ status: 200 });
    expect(deps.reassignOrganizer).toHaveBeenCalledWith("telegram:100", activityId, "telegram:200");
  });

  it("validates reassignment identifiers before mutation", async () => {
    const deps = dependencies();
    await expect(executeAdminRoleAction(superadmin, {
      action: "reassign_activity_organizer",
      activityId: "bad",
      targetUserKey: "telegram:200",
    }, deps)).resolves.toEqual({ status: 400, payload: { error: "invalid_activity_id" } });
    await expect(executeAdminRoleAction(superadmin, {
      action: "reassign_activity_organizer",
      activityId,
      targetUserKey: "200",
    }, deps)).resolves.toEqual({ status: 400, payload: { error: "invalid_target_user_key" } });
    expect(deps.reassignOrganizer).not.toHaveBeenCalled();
  });
});
