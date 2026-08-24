import { describe, expect, it } from "vitest";
import {
  buildFavoriteOrganizerRelationshipProjection,
  buildMemberOrganizerRelationships,
  buildOrganizerAcceptedTeam,
  buildOrganizerTeamRequests,
  mapOrganizerTeamRelationshipRow,
  type OrganizerTeamRelationshipRecord,
  type OrganizerTeamRelationshipStatus,
} from "./organizerTeamRelationships";

const relationship = (
  status: OrganizerTeamRelationshipStatus,
  overrides: Partial<OrganizerTeamRelationshipRecord> = {},
): OrganizerTeamRelationshipRecord => ({
  id: `relationship-${status}`,
  organizerUserKey: "organizer:1",
  memberUserKey: "member:1",
  status,
  source: "favorite_organizer",
  requestedAt: "2026-08-23T10:00:00.000Z",
  respondedAt: status === "accepted" || status === "declined" ? "2026-08-23T10:05:00.000Z" : null,
  acceptedAt: status === "accepted" ? "2026-08-23T10:05:00.000Z" : null,
  declinedAt: status === "declined" ? "2026-08-23T10:05:00.000Z" : null,
  withdrawnAt: status === "withdrawn" ? "2026-08-23T10:05:00.000Z" : null,
  createdAt: "2026-08-23T10:00:00.000Z",
  updatedAt: "2026-08-23T10:05:00.000Z",
  ...overrides,
});

describe("organizer team relationship domain", () => {
  it.each(["pending", "accepted", "declined", "withdrawn"] as const)("maps %s rows", (status: OrganizerTeamRelationshipStatus) => {
    const record = relationship(status);
    expect(mapOrganizerTeamRelationshipRow({
      id: record.id,
      organizer_user_key: record.organizerUserKey,
      member_user_key: record.memberUserKey,
      status: record.status,
      source: record.source,
      requested_at: record.requestedAt,
      responded_at: record.respondedAt,
      accepted_at: record.acceptedAt,
      declined_at: record.declinedAt,
      withdrawn_at: record.withdrawnAt,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    })).toEqual(record);
  });

  it("fails closed for unknown status or source", () => {
    const record = relationship("pending");
    const row = {
      id: record.id,
      organizer_user_key: record.organizerUserKey,
      member_user_key: record.memberUserKey,
      status: "reopened",
      source: "favorite_organizer",
      requested_at: record.requestedAt,
      responded_at: null,
      accepted_at: null,
      declined_at: null,
      withdrawn_at: null,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
    expect(() => mapOrganizerTeamRelationshipRow(row)).toThrow("invalid_organizer_team_relationship_row");
    expect(() => mapOrganizerTeamRelationshipRow({ ...row, status: "pending", source: "import" }))
      .toThrow("invalid_organizer_team_relationship_row");
  });

  it("builds role-aware projections for a multi-role actor without collisions", () => {
    const actor = "user:multi";
    const newestPending = relationship("pending", {
      id: "pending-new",
      organizerUserKey: actor,
      memberUserKey: "member:2",
      requestedAt: "2026-08-23T12:00:00.000Z",
      updatedAt: "2026-08-23T12:00:00.000Z",
    });
    const olderPending = relationship("pending", {
      id: "pending-old",
      organizerUserKey: actor,
      memberUserKey: "member:3",
      requestedAt: "2026-08-23T11:00:00.000Z",
      updatedAt: "2026-08-23T11:00:00.000Z",
    });
    const accepted = relationship("accepted", { id: "accepted", organizerUserKey: actor, memberUserKey: "member:4" });
    const memberSide = relationship("declined", { id: "member-side", organizerUserKey: "organizer:9", memberUserKey: actor });

    expect(buildOrganizerTeamRequests([olderPending, accepted, memberSide, newestPending], actor).map((item) => item.id))
      .toEqual(["pending-new", "pending-old"]);
    expect(buildOrganizerAcceptedTeam([olderPending, accepted, memberSide, newestPending], actor).map((item) => item.id))
      .toEqual(["accepted"]);
    expect(buildMemberOrganizerRelationships([olderPending, accepted, memberSide, newestPending], actor).map((item) => item.id))
      .toEqual(["member-side"]);
  });

  it("keeps Favorite and relationship facts independent", () => {
    expect(buildFavoriteOrganizerRelationshipProjection({
      organizerUserKey: "organizer:1",
      isFavorite: true,
      updatedAt: "2026-08-23T10:00:00.000Z",
    }, null)).toMatchObject({
      isFavorite: true,
      teamRelationshipStatus: null,
      relationshipUpdatedAt: null,
    });

    expect(buildFavoriteOrganizerRelationshipProjection({
      organizerUserKey: "organizer:1",
      isFavorite: false,
      updatedAt: "2026-08-23T10:10:00.000Z",
    }, relationship("accepted"))).toMatchObject({
      isFavorite: false,
      teamRelationshipStatus: "accepted",
    });

    expect(buildFavoriteOrganizerRelationshipProjection({
      organizerUserKey: "organizer:1",
      isFavorite: false,
    }, relationship("withdrawn"))).toMatchObject({
      isFavorite: false,
      teamRelationshipStatus: "withdrawn",
    });

    for (const status of ["declined", "withdrawn"] as const) {
      expect(buildFavoriteOrganizerRelationshipProjection({
        organizerUserKey: "organizer:1",
        isFavorite: true,
      }, relationship(status)).teamRelationshipStatus).toBe(status);
    }
  });

  it("rejects composition across different organizers", () => {
    expect(() => buildFavoriteOrganizerRelationshipProjection({
      organizerUserKey: "organizer:2",
      isFavorite: true,
    }, relationship("pending"))).toThrow("favorite_relationship_organizer_mismatch");
  });
});
