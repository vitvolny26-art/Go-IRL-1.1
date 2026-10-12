/**
 * People003A: schema-neutral domain contract for independent named teams.
 * These types do not grant access or imply a deployed persistence layer.
 * Server-side authorization and RLS are required before mutations are enabled.
 */
export type NamedTeamRole = "owner" | "admin" | "member";
export type NamedTeamMembershipStatus = "invited" | "active" | "declined" | "left" | "removed";

export type NamedTeam = {
  id: string;
  ownerUserKey: string;
  name: string;
  visibility: "private";
  createdAt: string;
  updatedAt: string;
};

export type NamedTeamMembership = {
  teamId: string;
  userKey: string;
  role: NamedTeamRole;
  status: NamedTeamMembershipStatus;
  updatedAt: string;
};

export type PersonalConnection = {
  userKey: string;
  peerUserKey: string;
  status: "pending" | "accepted" | "declined" | "removed";
  updatedAt: string;
};

/** A team member need not be a personal connection or organizer favorite. */
export const activeTeamMembers = (
  memberships: readonly NamedTeamMembership[],
  teamId: string,
): NamedTeamMembership[] => memberships.filter(
  (membership) => membership.teamId === teamId && membership.status === "active",
);

/** Read-only selector: event participation must still be approved separately. */
export const uniqueTeamInviteCandidates = (
  memberships: readonly NamedTeamMembership[],
  teamIds: readonly string[],
  actorUserKey: string,
): string[] => {
  const allowedTeams = new Set(teamIds);
  return [...new Set(memberships
    .filter((membership) => allowedTeams.has(membership.teamId)
      && membership.status === "active"
      && membership.userKey !== actorUserKey)
    .map((membership) => membership.userKey))];
};

/**
 * Client-side affordance checks only. The server must independently enforce
 * team ownership, membership, role hierarchy and account-scoped access.
 */
export const canInviteToNamedTeam = (role: NamedTeamRole | null): boolean =>
  role === "owner" || role === "admin";

export const canManageNamedTeamMember = (
  actorRole: NamedTeamRole | null,
  targetRole: NamedTeamRole,
): boolean => actorRole === "owner"
  ? targetRole !== "owner"
  : actorRole === "admin" && targetRole === "member";

export const canDeleteNamedTeam = (role: NamedTeamRole | null): boolean =>
  role === "owner";

/**
 * Presentation-only membership transitions. These never authorize writes:
 * trusted server RPCs must validate actor identity and role for every change.
 */
export type NamedTeamMembershipAction = "accept" | "decline" | "leave" | "remove";

export const canRequestNamedTeamMembershipAction = (
  action: NamedTeamMembershipAction,
  actorUserKey: string,
  actorRole: NamedTeamRole | null,
  target: NamedTeamMembership,
): boolean => {
  if (!actorUserKey.trim()) return false;
  const isSelf = actorUserKey === target.userKey;
  switch (action) {
    case "accept":
    case "decline":
      return isSelf && target.status === "invited";
    case "leave":
      return isSelf && target.status === "active" && target.role !== "owner";
    case "remove":
      return !isSelf && target.status === "active"
        && canManageNamedTeamMember(actorRole, target.role);
  }
};

/** Never show pending, declined or removed users as Activity invite candidates. */
export const uniqueActiveTeamInviteCandidates = (
  memberships: readonly NamedTeamMembership[],
  selectedTeamIds: readonly string[],
  actorUserKey: string,
  alreadyInvitedUserKeys: readonly string[] = [],
): string[] => {
  const excluded = new Set(alreadyInvitedUserKeys);
  return uniqueTeamInviteCandidates(memberships, selectedTeamIds, actorUserKey)
    .filter((userKey) => !excluded.has(userKey));
};
