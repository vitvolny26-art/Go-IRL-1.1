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
});
