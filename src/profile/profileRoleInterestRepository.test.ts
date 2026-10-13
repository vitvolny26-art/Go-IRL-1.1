import { describe, expect, it, vi } from "vitest";
import {
  profileRoleInterestSaveRpcName,
  profileRoleInterestTableName,
  SupabaseProfileRoleInterestRepository,
} from "./profileRoleInterestRepository";

const buildClient = () => {
  const order = vi.fn();
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn();
  return { client: { from, rpc }, from, select, order, rpc };
};

describe("SupabaseProfileRoleInterestRepository", () => {
  it("loads only the bounded role-interest projection", async () => {
    const mock = buildClient();
    mock.order.mockResolvedValue({
      data: [
        { role_id: "driver", interest_level: "can_help" },
        { role_id: "guide", interest_level: "want_to_try" },
      ],
      error: null,
    });

    const repository = new SupabaseProfileRoleInterestRepository(mock.client as never);
    await expect(repository.loadOwnRoleInterests()).resolves.toEqual({
      driver: "can_help",
      guide: "want_to_try",
    });

    expect(mock.from).toHaveBeenCalledWith(profileRoleInterestTableName);
    expect(mock.select).toHaveBeenCalledWith("role_id, interest_level");
  });

  it("saves through one owner-scoped atomic RPC payload", async () => {
    const mock = buildClient();
    mock.rpc.mockResolvedValue({
      data: [
        { role_id: "driver", interest_level: "professional" },
        { role_id: "translator", interest_level: "can_help" },
      ],
      error: null,
    });

    const repository = new SupabaseProfileRoleInterestRepository(mock.client as never);
    await expect(repository.saveOwnRoleInterests({
      translator: "can_help",
      driver: "professional",
    })).resolves.toEqual({
      driver: "professional",
      translator: "can_help",
    });

    expect(mock.rpc).toHaveBeenCalledWith(profileRoleInterestSaveRpcName, {
      p_role_interests: [
        { role_id: "driver", interest_level: "professional" },
        { role_id: "translator", interest_level: "can_help" },
      ],
    });
  });

  it("fails closed on invalid backend rows", async () => {
    const mock = buildClient();
    mock.order.mockResolvedValue({
      data: [{ role_id: "driver", interest_level: "admin" }],
      error: null,
    });

    const repository = new SupabaseProfileRoleInterestRepository(mock.client as never);
    await expect(repository.loadOwnRoleInterests()).rejects.toThrow(
      "profile_role_interest_invalid_response",
    );
  });
});
