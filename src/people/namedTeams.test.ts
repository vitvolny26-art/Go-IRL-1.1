import { describe, expect, it } from "vitest";
import { activeTeamMembers, uniqueTeamInviteCandidates, canInviteToNamedTeam, canManageNamedTeamMember, canDeleteNamedTeam, canRequestNamedTeamMembershipAction, uniqueActiveTeamInviteCandidates, type NamedTeamMembership } from "./namedTeams";

const members: NamedTeamMembership[] = [
  { teamId: "hikes", userKey: "owner", role: "owner", status: "active", updatedAt: "2026-10-12" },
  { teamId: "hikes", userKey: "a", role: "member", status: "active", updatedAt: "2026-10-12" },
  { teamId: "hikes", userKey: "b", role: "member", status: "invited", updatedAt: "2026-10-12" },
  { teamId: "friends", userKey: "a", role: "member", status: "active", updatedAt: "2026-10-12" },
  { teamId: "friends", userKey: "c", role: "member", status: "active", updatedAt: "2026-10-12" },
];

describe("People003A independent named-team contracts", () => {
  it("filters by team and active membership", () => {
    expect(activeTeamMembers(members, "hikes").map((m) => m.userKey)).toEqual(["owner", "a"]);
  });
  it("deduplicates invite candidates across teams and excludes the actor", () => {
    expect(uniqueTeamInviteCandidates(members, ["hikes", "friends"], "owner")).toEqual(["a", "c"]);
  });
  it("does not treat pending invitations as membership", () => {
    expect(uniqueTeamInviteCandidates(members, ["hikes"], "owner")).toEqual(["a"]);
  });
  it("does not require a personal connection or favorite to select an active team member", () => {
    expect(uniqueTeamInviteCandidates(members, ["friends"], "owner")).toEqual(["a", "c"]);
  });
});

describe("People003A named-team UI permissions", () => {
  it("restricts team deletion to the owner", () => {
    expect(canDeleteNamedTeam("owner")).toBe(true);
    expect(canDeleteNamedTeam("admin")).toBe(false);
    expect(canDeleteNamedTeam("member")).toBe(false);
    expect(canDeleteNamedTeam(null)).toBe(false);
  });
  it("prevents admins from removing owners or peer admins", () => {
    expect(canManageNamedTeamMember("admin", "owner")).toBe(false);
    expect(canManageNamedTeamMember("admin", "admin")).toBe(false);
    expect(canManageNamedTeamMember("admin", "member")).toBe(true);
    expect(canManageNamedTeamMember("member", "member")).toBe(false);
  });
  it("limits invitation controls to authorized team roles", () => {
    expect(canInviteToNamedTeam("owner")).toBe(true);
    expect(canInviteToNamedTeam("admin")).toBe(true);
    expect(canInviteToNamedTeam("member")).toBe(false);
  });
});

describe("People003A membership lifecycle affordances", () => {
  const invited = { teamId: "hikes", userKey: "b", role: "member" as const, status: "invited" as const, updatedAt: "2026-10-12" };
  const owner = members[0];
  const active = members[1];

  it("only lets invitees accept or decline their own pending invitations", () => {
    expect(canRequestNamedTeamMembershipAction("accept", "b", null, invited)).toBe(true);
    expect(canRequestNamedTeamMembershipAction("decline", "b", null, invited)).toBe(true);
    expect(canRequestNamedTeamMembershipAction("accept", "owner", "owner", invited)).toBe(false);
    expect(canRequestNamedTeamMembershipAction("accept", "a", "member", active)).toBe(false);
  });

  it("prevents owner self-leave and enforces removal role boundaries", () => {
    expect(canRequestNamedTeamMembershipAction("leave", "owner", "owner", owner)).toBe(false);
    expect(canRequestNamedTeamMembershipAction("leave", "a", "member", active)).toBe(true);
    expect(canRequestNamedTeamMembershipAction("remove", "owner", "owner", active)).toBe(true);
    expect(canRequestNamedTeamMembershipAction("remove", "a", "member", owner)).toBe(false);
    expect(canRequestNamedTeamMembershipAction("remove", "owner", "owner", invited)).toBe(false);
  });

  it("deduplicates active team invite candidates against existing Activity invites", () => {
    expect(uniqueActiveTeamInviteCandidates(members, ["hikes", "friends"], "owner", ["a"]))
      .toEqual(["c"]);
  });
});
