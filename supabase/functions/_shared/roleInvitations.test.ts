import { describe, expect, it } from "vitest";
import {
  createRoleInvitationToken,
  hashRoleInvitationToken,
  isRoleInvitationTargetRole,
  parseRoleInvitationStartParam,
  roleInvitationLifetimeSeconds,
} from "./roleInvitations";

describe("role invitation security helpers", () => {
  it("creates a startapp-safe 256-bit bearer token", () => {
    const token = createRoleInvitationToken();
    expect(token).toMatch(/^ri_[A-Za-z0-9_-]{43}$/);
    expect(parseRoleInvitationStartParam(token)).toBe(token);
    expect(roleInvitationLifetimeSeconds).toBe(86_400);
  });

  it("accepts only approved promotion roles", () => {
    expect(isRoleInvitationTargetRole("organizer")).toBe(true);
    expect(isRoleInvitationTargetRole("professional")).toBe(true);
    expect(isRoleInvitationTargetRole("admin")).toBe(true);
    expect(isRoleInvitationTargetRole("superadmin")).toBe(false);
    expect(isRoleInvitationTargetRole("master")).toBe(false);
  });

  it("rejects malformed, oversized and event invitation values", () => {
    expect(parseRoleInvitationStartParam("ri_short")).toBeNull();
    expect(parseRoleInvitationStartParam("3b172dd9-d5e2-4328-86a4-d4107a6359fc")).toBeNull();
    expect(parseRoleInvitationStartParam(`ri_${"a".repeat(44)}`)).toBeNull();
  });

  it("hashes tokens without retaining the bearer value", async () => {
    const token = `ri_${"a".repeat(43)}`;
    const hash = await hashRoleInvitationToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });
});
