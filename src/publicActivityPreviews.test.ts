import { describe, expect, it, vi } from "vitest";
import { loadPublicActivityPreviews } from "./publicActivityPreviews";

describe("public activity previews", () => {
  it("loads the sanitized public RPC and maps compact preview fields", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        id: "0f0f0f0f-1111-4222-8333-444444444444",
        title_ru: "Волейбол",
        title_cs: "Volejbal",
        event_date: "2026-08-10",
        event_time: "18:30:00",
        address: "Olomouc",
        price: 0,
      }],
      error: null,
    }));

    const previews = await loadPublicActivityPreviews("olomouc", "cs", { client: { rpc } });

    expect(rpc).toHaveBeenCalledWith("go_irl_list_public_activity_previews", {
      p_requested_city_id: "olomouc",
      p_limit: 8,
    });
    expect(previews).toEqual([{
      id: "0f0f0f0f-1111-4222-8333-444444444444",
      title: "Volejbal",
      date: "2026-08-10",
      time: "18:30",
      address: "Olomouc",
      price: 0,
    }]);
  });

  it("surfaces RPC errors without falling back to private tables", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "rpc unavailable" } }));

    await expect(loadPublicActivityPreviews("olomouc", "ru", { client: { rpc } }))
      .rejects.toEqual({ message: "rpc unavailable" });
  });
});
