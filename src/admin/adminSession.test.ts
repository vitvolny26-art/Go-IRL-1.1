import { describe, expect, it, vi } from "vitest";
import {
  adminRedirectForAuthorization,
  requestAdminSession,
  resolveAdminRoute,
  verifyCurrentAdminSession,
} from "./adminSession";

describe("admin session routing", () => {
  it("routes and redirects through protected admin surfaces", () => {
    expect(adminRedirectForAuthorization(true)).toBe("/admin");
    expect(adminRedirectForAuthorization(false)).toBe("/admin/access-denied");
    expect(resolveAdminRoute("/admin/login")).toBe("login");
    expect(resolveAdminRoute("/admin")).toBe("panel");
    expect(resolveAdminRoute("/admin/users")).toBe("panel");
    expect(resolveAdminRoute("/admin/access-denied")).toBe("denied");
    expect(resolveAdminRoute("/join/activity-id")).toBeNull();
  });

  it("sends only the bearer token and fails closed", async () => {
    const allowed = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init).toEqual({ method: "POST", headers: { authorization: "Bearer signed-session" } });
      return new Response(null, { status: 200 });
    });
    await expect(requestAdminSession("signed-session", allowed as typeof fetch)).resolves.toBe(true);
    await expect(requestAdminSession("", allowed as typeof fetch)).resolves.toBe(false);
    await expect(requestAdminSession("signed-session", vi.fn(async () => new Response(null, { status: 403 })) as typeof fetch)).resolves.toBe(false);
  });

  it("refreshes a cached trusted session once after a server 401", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("authorization");
      return new Response(null, { status: authorization === "Bearer fresh-session" ? 200 : 401 });
    });
    const refresh = vi.fn(async () => ({
      accessToken: "fresh-session",
      source: "trusted-telegram",
    }));

    await expect(verifyCurrentAdminSession(fetcher as typeof fetch, {
      current: () => null,
      initialize: async () => ({ accessToken: "stale-session", source: "trusted-telegram" }),
      refresh,
    })).resolves.toBe(true);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("refreshes a current Telegram session once after a server 403 role mismatch", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const authorization = new Headers(init?.headers).get("authorization");
      return new Response(null, { status: authorization === "Bearer fresh-superadmin-session" ? 200 : 403 });
    });
    const refresh = vi.fn(async () => ({
      accessToken: "fresh-superadmin-session",
      source: "trusted-telegram",
    }));

    await expect(verifyCurrentAdminSession(fetcher as typeof fetch, {
      current: () => null,
      initialize: async () => ({ accessToken: "stale-admin-session", source: "trusted-telegram" }),
      refresh,
    })).resolves.toBe(true);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("still fails closed when the refreshed trusted session remains forbidden", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 403 }));
    const refresh = vi.fn(async () => ({
      accessToken: "still-forbidden-session",
      source: "trusted-telegram",
    }));

    await expect(verifyCurrentAdminSession(fetcher as typeof fetch, {
      current: () => null,
      initialize: async () => ({ accessToken: "forbidden-session", source: "trusted-telegram" }),
      refresh,
    })).resolves.toBe(false);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
