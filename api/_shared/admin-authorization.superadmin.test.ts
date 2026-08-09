import { describe, expect, it, vi } from "vitest";
import {
  authorizeAdminRequest,
  isAdminRole,
  runAuthorizedAdminAction,
  type AdminAuthorizationDependencies,
} from "./admin-authorization.js";

const secret = "superadmin-test-secret-with-sufficient-length";
const allowedUserKey = "telegram:superadmin";
const issuer = "go-irl-supabase-edge";
const nowSeconds = 1_800_000_000;

const base64Url = (input: Uint8Array | string) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

async function signToken(goIrlRole: string) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    aud: "authenticated",
    role: "authenticated",
    sub: "00000000-0000-4000-8000-000000000002",
    exp: nowSeconds + 3600,
    iss: issuer,
    go_irl_user_key: allowedUserKey,
    go_irl_role: goIrlRole,
  }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${base64Url(signature)}`;
}

const requestWith = (token: string) => new Request("https://goirl.invalid/api/admin/session", {
  method: "POST",
  headers: { authorization: `Bearer ${token}` },
});

const dependencies = (role: string): AdminAuthorizationDependencies => ({
  allowedUserKeys: new Set([allowedUserKey]),
  issuer,
  jwtSecret: secret,
  loadRole: vi.fn(async () => role),
  nowSeconds,
});

describe("superadmin authorization", () => {
  it("recognizes only admin and superadmin as admin-class roles", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("superadmin")).toBe(true);
    expect(isAdminRole("moderator")).toBe(false);
    expect(isAdminRole("user")).toBe(false);
  });

  it("authorizes a current superadmin and preserves the distinct role", async () => {
    const token = await signToken("superadmin");
    await expect(authorizeAdminRequest(requestWith(token), dependencies("superadmin"))).resolves.toEqual({
      ok: true,
      userKey: allowedUserKey,
      subject: "00000000-0000-4000-8000-000000000002",
      role: "superadmin",
    });
  });

  it("continues to authorize a current admin", async () => {
    const token = await signToken("admin");
    await expect(authorizeAdminRequest(requestWith(token), dependencies("admin"))).resolves.toMatchObject({
      ok: true,
      role: "admin",
    });
  });

  it("fails closed when privileged JWT and current database role disagree", async () => {
    await expect(authorizeAdminRequest(
      requestWith(await signToken("superadmin")),
      dependencies("admin"),
    )).resolves.toEqual({ ok: false, status: 403, error: "access_denied" });

    await expect(authorizeAdminRequest(
      requestWith(await signToken("admin")),
      dependencies("superadmin"),
    )).resolves.toEqual({ ok: false, status: 403, error: "access_denied" });
  });

  it("does not elevate moderator to admin-class access", async () => {
    await expect(authorizeAdminRequest(
      requestWith(await signToken("moderator")),
      dependencies("moderator"),
    )).resolves.toEqual({ ok: false, status: 403, error: "access_denied" });
  });

  it("exposes the current privileged role to authorized server actions", async () => {
    const token = await signToken("superadmin");
    const result = await runAuthorizedAdminAction(
      requestWith(token),
      dependencies("superadmin"),
      (authorization) => authorization.role,
    );
    expect(result).toMatchObject({ ok: true, value: "superadmin", authorization: { role: "superadmin" } });
  });
});
