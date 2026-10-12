import type { NamedTeam, NamedTeamMembership } from "./namedTeams";

export type OwnTeamSummary = {
  team: NamedTeam;
  membership: NamedTeamMembership;
};

/** UI projection only; RLS remains the security boundary. */
export function selectOwnTeams(
  teams: readonly NamedTeam[],
  memberships: readonly NamedTeamMembership[],
  actorUserKey: string,
): OwnTeamSummary[] {
  if (!actorUserKey.trim()) return [];
  const own = new Map(memberships
    .filter((membership) => membership.userKey === actorUserKey &&
      (membership.status === "active" || membership.status === "invited"))
    .map((membership) => [membership.teamId, membership]));
  return teams.flatMap((team) => {
    const membership = own.get(team.id);
    return membership ? [{ team, membership }] : [];
  });
}
