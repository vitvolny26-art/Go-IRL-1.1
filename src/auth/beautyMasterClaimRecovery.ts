import type { UserRole } from "../types";

const recoveryParam = "claimRecovery";

export type BeautyMasterAlreadyClaimedAction = "return_claimed" | "reauthenticate" | "stop";

export const hasBeautyMasterClaimRecovery = (url: string) =>
  new URL(url).searchParams.get(recoveryParam) === "1";

export const markBeautyMasterClaimRecovery = (url: string) => {
  const next = new URL(url);
  next.searchParams.set(recoveryParam, "1");
  return next.toString();
};

export const resolveBeautyMasterAlreadyClaimedAction = (
  role: UserRole,
  recoveryRequested: boolean,
): BeautyMasterAlreadyClaimedAction => {
  if (role === "professional") return "return_claimed";
  return recoveryRequested ? "stop" : "reauthenticate";
};
