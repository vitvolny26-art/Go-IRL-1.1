import { describe, expect, it, vi } from "vitest";
import {
  buildRoleInvitationUrl,
  getRoleDemotionErrorMessage,
  isRoleInvitationStartParam,
  requestRoleAssignments,
  requestRoleDemotion,
  requestRoleInvitation,
} from "./roleInvitations";

const startParam = `ri_${"a".repeat(43)}`;
const dependencies = {
  initData: "signed-init-data",
  publishableKey: "publishable-key",
  supabaseUrl: "https://project.supabase.co",
};

describe("admin role invitations", () => {
  it("builds a Telegram Mini App link without identity data", () => {
    expect(buildRoleInvitationUrl(startParam, "@GOirl_bot")).toBe(`https://t.me/GOirl_bot?startapp=${startParam}`);
    expect(isRoleInvitationStartParam(startParam)).toBe(true);
    expect(buildRoleInvitationUrl("bad-token", "GOirl_bot")).toBeNull();
  });

  it.each(["organizer", "admin"] as const)("creates a %s invitation through the trusted verifier", async (targetRole) => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        action: "create_role_invitation",
        targetRole,
        initData: "signed-init-data",
      });
      return new Response(JSON.stringify({ invitation: {
        id: "11f4dc06-3f32-4b63-93f9-7e4e4d1f7f85",
        startParam,
        targetRole,
        expiresAt: "2026-08-01T12:00:00.000Z",
      } }), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    await expect(requestRoleInvitation(targetRole, { ...dependencies, fetcher: fetcher as typeof fetch }))
      .resolves.toMatchObject({ targetRole, startParam });
  });

  it("fails closed when trusted Telegram data is missing", async () => {
    const fetcher = vi.fn();
    await expect(requestRoleInvitation("organizer", {
      ...dependencies,
      initData: "",
      fetcher: fetcher as typeof fetch,
    })).rejects.toThrow("telegram_init_data_required");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("admin role management", () => {
  it("loads elevated role assignments including superadmin", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ action: "list_role_assignments", initData: "signed-init-data" });
      return new Response(JSON.stringify({ roleAssignments: [{
        user_key: "telegram:8585124925",
        telegram_id: 8585124925,
        first_name: "Test",
        last_name: "Owner",
        username: "testowner",
        role: "superadmin",
        updated_at: "2026-08-01T00:00:00.000Z",
      }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    await expect(requestRoleAssignments({ ...dependencies, fetcher: fetcher as typeof fetch }))
      .resolves.toEqual([expect.objectContaining({ userKey: "telegram:8585124925", role: "superadmin" })]);
  });

  it("normalizes the backend demotion response", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        action: "demote_role",
        targetUserKey: "telegram:8585124925",
        initData: "signed-init-data",
      });
      return new Response(JSON.stringify({ roleDemotion: {
        status: "updated",
        previous_role: "professional",
        current_role: "user",
      } }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    await expect(requestRoleDemotion("telegram:8585124925", { ...dependencies, fetcher: fetcher as typeof fetch }))
      .resolves.toEqual({ status: "updated", previousRole: "professional", currentRole: "user" });
  });

  it.each([
    ["role_conflict", "Роль уже изменилась. Обновите список."],
    ["not_found", "Пользователь больше не найден. Обновите список."],
    ["invalid", "Некорректная запись пользователя. Обновите список."],
    ["invalid_target_user_key", "Некорректная запись пользователя. Обновите список."],
    ["access_denied", "Доступ администратора больше не подтверждён. Откройте админ-панель заново."],
    ["unexpected", "Не удалось разжаловать пользователя."],
  ])("maps %s to a safe admin message", (code, message) => {
    expect(getRoleDemotionErrorMessage(new Error(code))).toBe(message);
  });

  it.each(["role_conflict", "not_found", "invalid"] as const)("surfaces %s from the protected backend", async (status) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ roleDemotion: {
      status,
      previous_role: status === "role_conflict" ? "user" : null,
      current_role: status === "role_conflict" ? "user" : null,
    } }), { status: 409, headers: { "Content-Type": "application/json" } }));

    await expect(requestRoleDemotion("telegram:8585124925", { ...dependencies, fetcher: fetcher as typeof fetch }))
      .rejects.toThrow(status);
  });

  it("rejects malformed user keys before network access", async () => {
    const fetcher = vi.fn();
    await expect(requestRoleDemotion("8585124925", { ...dependencies, fetcher: fetcher as typeof fetch }))
      .rejects.toThrow("invalid_target_user_key");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
