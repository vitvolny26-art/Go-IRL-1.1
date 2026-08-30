import { describe, expect, it } from "vitest";
import { isBeautyWorkspaceOwnerTransferToken } from "./beautyWorkspaceOwnerTransfer";

describe("Beauty workspace owner transfer token", () => {
  it("accepts the 32-byte base64url token shape", () => {
    expect(isBeautyWorkspaceOwnerTransferToken("A".repeat(43))).toBe(true);
  });

  it("rejects malformed or prefixed values", () => {
    expect(isBeautyWorkspaceOwnerTransferToken("A".repeat(42))).toBe(false);
    expect(isBeautyWorkspaceOwnerTransferToken(`ot_${"A".repeat(43)}`)).toBe(false);
    expect(isBeautyWorkspaceOwnerTransferToken(`${"A".repeat(42)}+`)).toBe(false);
  });
});
