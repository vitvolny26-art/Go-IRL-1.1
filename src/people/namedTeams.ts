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
