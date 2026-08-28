import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeAdminRequest: vi.fn(),
  executeAdminRoleAction: vi.fn(),
  productionAdminAuthorizationDependencies: vi.fn(() => ({ marker: "auth" })),
  productionAdminRoleActionDependencies: vi.fn(() => ({ marker: "actions" })),
}));

vi.mock("../_shared/admin-authorization.js", () => ({
  authorizeAdminRequest: mocks.authorizeAdminRequest,
  productionAdminAuthorizationDependencies: mocks.productionAdminAuthorizationDependencies,
}));
vi.mock("../_shared/admin-role-actions.js", () => ({
  executeAdminRoleAction: mocks.executeAdminRoleAction,
  productionAdminRoleActionDependencies: mocks.productionAdminRoleActionDependencies,
}));
vi.mock("../_shared/instagram-publisher-readiness.js", () => ({ checkInstagramPublisherReadiness: vi.fn() }));
vi.mock("../_shared/social-publishing.js", () => ({ publishSocialEvent: vi.fn() }));
vi.mock("../_shared/vercel-handler.js", () => ({ createVercelHandler: (handler: unknown) => handler }));

import { handleAdminSession } from "./session.js";

const request = (body?: Record<string, unknown>, token = "trusted-jwt") => new Request("https://goirl.invalid/api/admin/session", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    ...(body ? { "content-type": "application/json" } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
});

const authorized = { ok: true, userKey: "telegram:100", subject: "subject", role: "superadmin" } as const;

describe("admin session role-action routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAdminRequest.mockResolvedValue(authorized);
  });

  it("returns the revalidated current role for the session action", async () => {
    const response = await handleAdminSession(request({ action: "session" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authorized: true, user: { role: "superadmin" } });
    expect(mocks.executeAdminRoleAction).not.toHaveBeenCalled();
  });

  it("keeps empty-body admin verification compatible", async () => {
    const response = await handleAdminSession(request());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ authorized: true, user: { role: "superadmin" } });
  });

  it("does not execute role actions when bearer authorization fails", async () => {
    mocks.authorizeAdminRequest.mockResolvedValue({ ok: false, status: 401, error: "access_denied" });
    const response = await handleAdminSession(request({ action: "list_role_assignments" }, "expired-jwt"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "access_denied" });
    expect(mocks.executeAdminRoleAction).not.toHaveBeenCalled();
  });

  it("routes an authorized role action only after authorization", async () => {
    mocks.executeAdminRoleAction.mockResolvedValue({ status: 200, payload: { roleAssignments: [] } });
    const req = request({ action: "list_role_assignments" });
    const response = await handleAdminSession(req);
    expect(mocks.authorizeAdminRequest).toHaveBeenCalledWith(req, { marker: "auth" });
    expect(mocks.executeAdminRoleAction).toHaveBeenCalledWith(
      authorized,
      { action: "list_role_assignments", activityId: undefined, targetRole: undefined, targetUserKey: undefined },
      { marker: "actions" },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ roleAssignments: [] });
  });

  it("rejects unknown actions without executing mutations", async () => {
    const response = await handleAdminSession(request({ action: "delete_everything" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_action" });
    expect(mocks.executeAdminRoleAction).not.toHaveBeenCalled();
  });
});
