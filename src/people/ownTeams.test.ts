import { describe, expect, it } from "vitest";
import type { NamedTeam, NamedTeamMembership } from "./namedTeams";
import { selectOwnTeams } from "./ownTeams";

const teams: NamedTeam[] = [
  { id: "one", name: "Hikers", ownerUserKey: "alice", visibility: "private", createdAt: "", updatedAt: "" },
  { id: "two", name: "Cyclists", ownerUserKey: "bob", visibility: "private", createdAt: "", updatedAt: "" },
  { id: "three", name: "Readers", ownerUserKey: "carol", visibility: "private", createdAt: "", updatedAt: "" },
];
const memberships: NamedTeamMembership[] = [
  { teamId: "one", userKey: "alice", role: "owner", status: "active", updatedAt: "" },
  { teamId: "two", userKey: "alice", role: "member", status: "invited", updatedAt: "" },
  { teamId: "three", userKey: "alice", role: "member", status: "removed", updatedAt: "" },
  { teamId: "three", userKey: "bob", role: "owner", status: "active", updatedAt: "" },
];

describe("People003A My Teams selector", () => {
  it("lists only active and invited memberships belonging to the actor", () => {
    expect(selectOwnTeams(teams, memberships, "alice").map(({ team }) => team.id)).toEqual(["one", "two"]);
  });

  it("does not leak teams with another actor's memberships", () => {
    expect(selectOwnTeams(teams, memberships, "bob").map(({ team }) => team.id)).toEqual(["three"]);
  });

  it("rejects an empty actor and handles missing memberships", () => {
    expect(selectOwnTeams(teams, memberships, " ")).toEqual([]);
    expect(selectOwnTeams(teams, [], "alice")).toEqual([]);
  });

  it("preserves role and membership status for UI display", () => {
    expect(selectOwnTeams(teams, memberships, "alice")[1].membership).toMatchObject({
      role: "member", status: "invited",
    });
  });
});
