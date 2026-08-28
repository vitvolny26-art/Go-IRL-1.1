import { describe, expect, it } from "vitest";
import {
  hasBeautyMasterClaimRecovery,
  markBeautyMasterClaimRecovery,
  resolveBeautyMasterAlreadyClaimedAction,
} from "./beautyMasterClaimRecovery";

describe("beauty master claim recovery", () => {
  it("marks one OAuth recovery pass without losing the claim token", () => {
    const marked = markBeautyMasterClaimRecovery("https://go-irl.fun/beauty/claim?token=abc#claim");

    expect(hasBeautyMasterClaimRecovery(marked)).toBe(true);
    expect(new URL(marked).searchParams.get("token")).toBe("abc");
    expect(new URL(marked).hash).toBe("#claim");
  });

  it("returns an already-claimed workspace when the trusted role is already professional", () => {
    expect(resolveBeautyMasterAlreadyClaimedAction("professional", false)).toBe("return_claimed");
    expect(resolveBeautyMasterAlreadyClaimedAction("professional", true)).toBe("return_claimed");
  });

  it("reauthenticates a stale user token exactly once", () => {
    expect(resolveBeautyMasterAlreadyClaimedAction("user", false)).toBe("reauthenticate");
    expect(resolveBeautyMasterAlreadyClaimedAction("user", true)).toBe("stop");
  });
});
