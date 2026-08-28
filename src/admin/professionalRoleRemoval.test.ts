import { describe, expect, it, vi } from "vitest";
import { requestRoleDemotion } from "./roleInvitations";

const dependencies = {
  accessToken: "trusted-jwt",
};

describe("admin role demotion", () => {
  it("fails closed on a denied request", async () => {
    await expect(requestRoleDemotion("telegram:8585124925", {
      ...dependencies,
      fetcher: vi.fn(async () => new Response(JSON.stringify({ error: "access_denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
    })).rejects.toThrow("access_denied");
  });

  it("surfaces role conflicts returned by the server", async () => {
    await expect(requestRoleDemotion("telegram:8585124925", {
      ...dependencies,
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        roleDemotion: { status: "role_conflict", previousRole: "admin", currentRole: "admin" },
      }), { status: 409, headers: { "Content-Type": "application/json" } })) as typeof fetch,
    })).rejects.toThrow("role_conflict");
  });
});
