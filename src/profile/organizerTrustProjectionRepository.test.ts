import { describe, expect, it, vi } from "vitest";
import { loadOrganizerTrustProjection, loadOrganizerTrustProjectionMap } from "./organizerTrustProjectionRepository";

const client = (result: unknown) => ({
  rpc: vi.fn().mockResolvedValue(result),
});

describe("organizer trust projection repository", () => {
  it("calls the bounded aggregate RPC and parses its row", async () => {
    const mock = client({
      data: [{ average_rating: "4.8", rating_count: "37", completed_activity_count: "12" }],
      error: null,
    });

    await expect(loadOrganizerTrustProjection(" organizer:1 ", mock as never)).resolves.toEqual({
      averageRating: 4.8,
      ratingCount: 37,
      completedActivityCount: 12,
    });
    expect(mock.rpc).toHaveBeenCalledWith("go_irl_get_organizer_stats", {
      p_organizer_user_key: "organizer:1",
    });
  });

  it("returns null without an RPC call for an empty organizer key", async () => {
    const mock = client({ data: [], error: null });
    await expect(loadOrganizerTrustProjection("   ", mock as never)).resolves.toBeNull();
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("fails closed on malformed projection rows", async () => {
    const mock = client({
      data: [{ average_rating: 0, rating_count: 2, completed_activity_count: 5 }],
      error: null,
    });
    await expect(loadOrganizerTrustProjection("organizer:1", mock as never)).resolves.toBeNull();
  });

  it("keeps one failed favorite organizer from breaking the projection map", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ average_rating: 5, rating_count: 1, completed_activity_count: 1 }], error: null })
      .mockRejectedValueOnce(new Error("network"));
    const map = await loadOrganizerTrustProjectionMap(["organizer:1", "organizer:2", "organizer:1"], { rpc } as never);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(map.get("organizer:1")).toEqual({ averageRating: 5, ratingCount: 1, completedActivityCount: 1 });
    expect(map.get("organizer:2")).toBeNull();
  });
});
