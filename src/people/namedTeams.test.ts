import { describe, expect, it } from "vitest";
import { activeTeamMembers, uniqueTeamInviteCandidates, type NamedTeamMembership } from "./namedTeams";

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
