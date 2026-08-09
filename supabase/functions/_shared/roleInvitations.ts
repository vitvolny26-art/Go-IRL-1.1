export const roleInvitationPrefix = "ri_";
export const roleInvitationLifetimeSeconds = 24 * 60 * 60;

export type RoleInvitationTargetRole = "organizer" | "professional" | "admin";
export type RoleInvitationRedemptionStatus = "accepted" | "invalid" | "role_conflict";

const tokenPattern = /^ri_[A-Za-z0-9_-]{43}$/;

export const isRoleInvitationTargetRole = (value: unknown): value is RoleInvitationTargetRole =>
  value === "organizer" || value === "professional" || value === "admin";

export const parseRoleInvitationStartParam = (value: unknown) => {
  const token = typeof value === "string" ? value.trim() : "";
  return tokenPattern.test(token) ? token : null;
};

const base64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

export const createRoleInvitationToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${roleInvitationPrefix}${base64Url(bytes)}`;
};

export const hashRoleInvitationToken = async (token: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
