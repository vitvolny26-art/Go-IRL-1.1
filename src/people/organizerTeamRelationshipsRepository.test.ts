import { describe, expect, it } from "vitest";
import { SupabaseOrganizerTeamRelationshipsRepository } from "./organizerTeamRelationshipsRepository";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "relationship:1",
  organizer_user_key: "organizer:1",
  member_user_key: "member:1",
  status: "pending",
  source: "favorite_organizer",
  requested_at: "2026-08-23T10:00:00.000Z",
  responded_at: null,
  accepted_at: null,
  declined_at: null,
  withdrawn_at: null,
  created_at: "2026-08-23T10:00:00.000Z",
  updated_at: "2026-08-23T10:00:00.000Z",
  ...overrides,
});

const createLoadClient = (data: unknown) => {
  const calls: Array<[string, unknown?]> = [];
  return {
    calls,
    client: {
      from: (table: string) => {
        calls.push(["from", table]);
        return {
          select: async (columns: string) => {
            calls.push(["select", columns]);
            return { data, error: null };
          },
        };
      },
    },
  };
};

const createRpcClient = (data: unknown) => {
  const calls: Array<[string, unknown]> = [];
  return {
    calls,
    client: {
      rpc: async (name: string, args: unknown) => {
        calls.push([name, args]);
        return { data, error: null };
      },
    },
  };
};

describe("SupabaseOrganizerTeamRelationshipsRepository", () => {
  it("reads the canonical table and defensively retains only actor participant rows", async () => {
    const mock = createLoadClient([
      row(),
      row({ id: "member-side", organizer_user_key: "organizer:2", member_user_key: "organizer:1" }),
      row({ id: "unrelated", organizer_user_key: "organizer:3", member_user_key: "member:3" }),
    ]);
    const repository = new SupabaseOrganizerTeamRelationshipsRepository(mock.client as never, "organizer:1");

    await expect(repository.loadForActor()).resolves.toMatchObject([
      { id: "relationship:1", organizerUserKey: "organizer:1", memberUserKey: "member:1" },
      { id: "member-side", organizerUserKey: "organizer:2", memberUserKey: "organizer:1" },
    ]);
    expect(mock.calls[0]).toEqual(["from", "organizer_team_relationships"]);
    expect(mock.calls[1]?.[0]).toBe("select");
    expect(String(mock.calls[1]?.[1])).toContain("organizer_user_key");
    expect(String(mock.calls[1]?.[1])).toContain("updated_at");
  });

  it("returns a deterministic empty state", async () => {
    const mock = createLoadClient([]);
    const repository = new SupabaseOrganizerTeamRelationshipsRepository(mock.client as never, "organizer:1");
    await expect(repository.loadForActor()).resolves.toEqual([]);
  });

  it.each([
    ["changed", "accepted"],
    ["existing", "accepted"],
    ["stale", "pending"],
    ["invalid_transition", "declined"],
  ] as const)("maps %s RPC responses", async (result: "changed" | "existing" | "stale" | "invalid_transition", status: "accepted" | "pending" | "declined") => {
    const mock = createRpcClient([{
      result,
      organizer_user_key: "organizer:1",
      member_user_key: "member:1",
      relationship_status: status,
      updated_at: "2026-08-23T10:05:00.000Z",
    }]);
    const repository = new SupabaseOrganizerTeamRelationshipsRepository(mock.client as never, "organizer:1");

    await expect(repository.respond("member:1", "accept", "2026-08-23T10:00:00.000Z")).resolves.toEqual({
      result,
      organizerUserKey: "organizer:1",
      memberUserKey: "member:1",
      relationshipStatus: status,
      updatedAt: "2026-08-23T10:05:00.000Z",
    });
    expect(mock.calls).toEqual([["go_irl_respond_team_request", {
      p_member_user_key: "member:1",
      p_decision: "accept",
      p_expected_updated_at: "2026-08-23T10:00:00.000Z",
    }]]);
  });

  it("maps not_found with null relationship state", async () => {
    const mock = createRpcClient([{
      result: "not_found",
      organizer_user_key: "organizer:1",
      member_user_key: "member:1",
      relationship_status: null,
      updated_at: null,
    }]);
    const repository = new SupabaseOrganizerTeamRelationshipsRepository(mock.client as never, "organizer:1");

    await expect(repository.respond("member:1", "decline", "2026-08-23T10:00:00.000Z")).resolves.toMatchObject({
      result: "not_found",
      relationshipStatus: null,
      updatedAt: null,
    });
  });

  it("fails closed for unknown RPC result or scope mismatch", async () => {
    const unknown = createRpcClient([{
      result: "reopened",
      organizer_user_key: "organizer:1",
      member_user_key: "member:1",
      relationship_status: "pending",
      updated_at: "2026-08-23T10:05:00.000Z",
    }]);
    await expect(new SupabaseOrganizerTeamRelationshipsRepository(unknown.client as never, "organizer:1")
      .respond("member:1", "accept", "2026-08-23T10:00:00.000Z"))
      .rejects.toThrow("invalid_organizer_team_relationship_response");

    const leaked = createRpcClient([{
      result: "changed",
      organizer_user_key: "organizer:other",
      member_user_key: "member:1",
      relationship_status: "accepted",
      updated_at: "2026-08-23T10:05:00.000Z",
    }]);
    await expect(new SupabaseOrganizerTeamRelationshipsRepository(leaked.client as never, "organizer:1")
      .respond("member:1", "accept", "2026-08-23T10:00:00.000Z"))
      .rejects.toThrow("organizer_team_relationship_response_scope_mismatch");
  });

  it("requires a trusted actor key before any read", () => {
    const mock = createLoadClient([]);
    expect(() => new SupabaseOrganizerTeamRelationshipsRepository(mock.client as never, "   "))
      .toThrow("organizer_team_relationship_actor_required");
  });
});
