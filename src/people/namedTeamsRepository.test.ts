import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseNamedTeamsRepository } from "./namedTeamsRepository";

const team = {
  id: "team-1",
  owner_user_key: "actor",
  name: "Hiking",
  visibility: "private" as const,
  created_at: "2026-10-12T00:00:00Z",
  updated_at: "2026-10-12T00:00:00Z",
};

describe("People003A named teams repository", () => {
  it("rejects an empty actor before any database access", () => {
    expect(() => new SupabaseNamedTeamsRepository({} as SupabaseClient, "  "))
      .toThrow("named_team_actor_required");
  });

  it.each(["", "   ", "x".repeat(81)])("rejects invalid team names without a write", async (name) => {
    const from = vi.fn();
    const repository = new SupabaseNamedTeamsRepository({ from } as unknown as SupabaseClient, "actor");
    await expect(repository.createTeam(name)).rejects.toThrow("invalid_named_team_name");
    expect(from).not.toHaveBeenCalled();
  });

  it("trims names, scopes ownership to the actor and validates the returned owner", async () => {
    const single = vi.fn().mockResolvedValue({ data: team, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const repository = new SupabaseNamedTeamsRepository({ from } as unknown as SupabaseClient, "actor");

    await expect(repository.createTeam("  Hiking  ")).resolves.toMatchObject({
      id: "team-1", name: "Hiking", ownerUserKey: "actor",
    });
    expect(from).toHaveBeenCalledWith("named_teams");
    expect(insert).toHaveBeenCalledWith({
      name: "Hiking", owner_user_key: "actor", visibility: "private",
    });
  });

  it("rejects a create response owned by a different account", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { ...team, owner_user_key: "someone-else" }, error: null,
    });
    const from = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single }),
      }),
    });
    const repository = new SupabaseNamedTeamsRepository({ from } as unknown as SupabaseClient, "actor");
    await expect(repository.createTeam("Hiking")).rejects.toThrow("invalid_named_team_create_response");
  });

  it("propagates Supabase read errors", async () => {
    const failure = new Error("database_unavailable");
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: failure }),
    });
    const repository = new SupabaseNamedTeamsRepository({ from } as unknown as SupabaseClient, "actor");
    await expect(repository.listTeams()).rejects.toBe(failure);
  });

  it("calls membership action RPC with a trimmed target", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const repository = new SupabaseNamedTeamsRepository({ rpc } as unknown as SupabaseClient, "actor");
    await repository.membershipAction("team-1", "invite", " other ");
    expect(rpc).toHaveBeenCalledWith("go_irl_named_team_membership_action", {
      p_team_id: "team-1", p_action: "invite", p_target_user_key: "other",
    });
  });

  it("rejects a missing invitation target without sending RPC", async () => {
    const rpc = vi.fn();
    const repository = new SupabaseNamedTeamsRepository({ rpc } as unknown as SupabaseClient, "actor");
    await expect(repository.membershipAction("team-1", "invite")).rejects.toThrow("named_team_target_required");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("propagates membership authorization failures", async () => {
    const failure = new Error("permission_denied");
    const rpc = vi.fn().mockResolvedValue({ error: failure });
    const repository = new SupabaseNamedTeamsRepository({ rpc } as unknown as SupabaseClient, "actor");
    await expect(repository.membershipAction("team-1", "leave")).rejects.toBe(failure);
  });

  it("renames through owner-only RPC with a trimmed name", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const repository = new SupabaseNamedTeamsRepository({ rpc } as unknown as SupabaseClient, "actor");
    await repository.manageTeam("team-1", "rename", "  Hiking group  ");
    expect(rpc).toHaveBeenCalledWith("go_irl_named_team_manage", {
      p_team_id: "team-1", p_action: "rename", p_name: "Hiking group",
    });
  });

  it.each(["", "  ", "x".repeat(81)])("rejects invalid rename without RPC", async (name) => {
    const rpc = vi.fn();
    const repository = new SupabaseNamedTeamsRepository({ rpc } as unknown as SupabaseClient, "actor");
    await expect(repository.manageTeam("team-1", "rename", name)).rejects.toThrow("invalid_named_team_name");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("deletes by team ID, never by display name", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const repository = new SupabaseNamedTeamsRepository({ rpc } as unknown as SupabaseClient, "actor");
    await repository.manageTeam("team-1", "delete");
    expect(rpc).toHaveBeenCalledWith("go_irl_named_team_manage", {
      p_team_id: "team-1", p_action: "delete", p_name: null,
    });
  });

  it("propagates owner permission denial", async () => {
    const failure = new Error("team_permission_denied");
    const rpc = vi.fn().mockResolvedValue({ error: failure });
    const repository = new SupabaseNamedTeamsRepository({ rpc } as unknown as SupabaseClient, "actor");
    await expect(repository.manageTeam("team-1", "delete")).rejects.toBe(failure);
  });

  it("reads only the actor's membership rows", async () => {
    const eq = vi.fn().mockResolvedValue({ data: [{
      team_id: "team-1", user_key: "actor", role: "owner",
      status: "active", updated_at: "2026-10-12T00:00:00Z",
    }], error: null });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const repository = new SupabaseNamedTeamsRepository({ from } as unknown as SupabaseClient, "actor");
    await expect(repository.listOwnMemberships()).resolves.toMatchObject([
      { teamId: "team-1", userKey: "actor", role: "owner", status: "active" },
    ]);
    expect(from).toHaveBeenCalledWith("named_team_memberships");
    expect(eq).toHaveBeenCalledWith("user_key", "actor");
  });
  it("searches by trimmed name with a team-scoped RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ user_key: "u2", display_name: "Alice", username: "alice", role: null, status: null }], error: null });
    const repository = new SupabaseNamedTeamsRepository({ rpc } as unknown as SupabaseClient, "actor");
    await expect(repository.listTeamPeople("team-1", "search", "  Ali  ")).resolves.toEqual([
      { userKey: "u2", displayName: "Alice", username: "alice", role: null, status: null },
    ]);
    expect(rpc).toHaveBeenCalledWith("go_irl_named_team_people", {
      p_team_id: "team-1", p_mode: "search", p_query: "Ali",
    });
  });

  it("rejects short searches without accessing the database", async () => {
    const rpc = vi.fn();
    const repository = new SupabaseNamedTeamsRepository({ rpc } as unknown as SupabaseClient, "actor");
    await expect(repository.listTeamPeople("team-1", "search", "ab")).rejects.toThrow("invalid_search_query");
    expect(rpc).not.toHaveBeenCalled();
  });

});
