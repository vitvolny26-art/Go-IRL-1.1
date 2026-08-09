import { describe, expect, it, vi } from "vitest";
import { loadPublicActivityCatalogRows, loadPublicActivityPreviews } from "./publicActivityPreviews";

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

  it("loads the v2 sanitized catalog without identity fields", async () => {
    const row = {
      id: "0f0f0f0f-1111-4222-8333-444444444444",
      category_id: "sport",
      activity_ru: "Волейбол",
      activity_cs: "Volejbal",
      title_ru: "Волейбол",
      title_cs: "Volejbal",
      description_ru: "Игра",
      description_cs: "Hra",
      event_date: "2026-08-10",
      event_time: "18:30:00",
      city_id: "olomouc",
      address: "Olomouc",
      activity_type: "sport",
      price: 0,
      capacity: 12,
      participant_count: 1,
      urgent: false,
      popular: true,
    };
    const rpc = vi.fn(async () => ({ data: [row], error: null }));

    const result = await loadPublicActivityCatalogRows("olomouc", { client: { rpc } });

    expect(rpc).toHaveBeenCalledWith("go_irl_list_public_activity_previews_v2", {
      p_requested_city_id: "olomouc",
      p_limit: 100,
    });
    expect(result).toEqual([row]);
    expect(result[0]).not.toHaveProperty("organizer_key");
    expect(result[0]).not.toHaveProperty("organizer");
    expect(result[0]).not.toHaveProperty("members");
    expect(result[0]).not.toHaveProperty("display_name");
  });

  it("surfaces RPC errors without falling back to private tables", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "rpc unavailable" } }));

    await expect(loadPublicActivityPreviews("olomouc", "ru", { client: { rpc } }))
      .rejects.toEqual({ message: "rpc unavailable" });
  });
});
