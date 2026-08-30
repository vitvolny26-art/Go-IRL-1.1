import { describe, expect, it } from "vitest";
import type { AuthorizedAdmin } from "./admin-authorization.js";
import { decideBeautyOwnerTransfer, listPendingBeautyOwnerTransfers } from "./beauty-owner-transfers.js";

const admin: AuthorizedAdmin = {
  ok: true,
  userKey: "telegram:1001",
  subject: "user-1001",
  role: "admin",
};

const superadmin: AuthorizedAdmin = {
  ok: true,
  userKey: "telegram:1002",
  subject: "user-1002",
  role: "superadmin",
};

describe("Beauty owner transfer admin boundary", () => {
  it("rejects non-superadmin listing before database access", async () => {
    await expect(listPendingBeautyOwnerTransfers(admin)).resolves.toEqual({
      status: 403,
      payload: { error: "access_denied" },
    });
  });

  it("rejects non-superadmin decisions before database access", async () => {
    await expect(decideBeautyOwnerTransfer(
      admin,
      "4d7b34de-b54f-4b4c-b273-7d4767758370",
      "approve",
    )).resolves.toEqual({ status: 403, payload: { error: "access_denied" } });
  });

  it("accepts only canonical UUID-shaped transfer ids", async () => {
    await expect(decideBeautyOwnerTransfer(superadmin, "4d7b34de-b54f-4b4c-7d4767758370", "approve"))
      .resolves.toEqual({ status: 400, payload: { error: "invalid_request" } });
  });
});
