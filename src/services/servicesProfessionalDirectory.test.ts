import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadProfessionalDirectory,
  professionalCountLabel,
  professionalsForCity,
  sharedMockProfessionals,
} from "./servicesProfessionalDirectory";

describe("services professional directory", () => {
  it("keeps Studio Vita inside explicit browser demo mode", async () => {
    await expect(loadProfessionalDirectory("olomouc", "en", { browserMock: true })).resolves.toEqual(sharedMockProfessionals);
    expect(professionalsForCity("praha", sharedMockProfessionals)).toEqual([]);
  });

  it("requests and maps the expanded client-language public projection", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        profile_id: "00000000-0000-4000-8000-000000000001",
        service_id: "00000000-0000-4000-8000-000000000002",
        slug: "beauty-0123456789abcdef",
        display_name: "Studio Server",
        city_id: "olomouc",
        public_location: "Centrum, Olomouc",
        description: "Český popis",
        instagram_url: "https://instagram.com/studio-server",
        experience: "8 let praxe",
        specialization: "Gel lak",
        hygiene: "Sterilizované nástroje",
        materials: "Premium brands",
        spoken_languages: "Čeština, English",
        certificates: "Nail Academy 2025",
        booking_notes: "Přijďte včas",
        portfolio: [{ id: "work-1", image_url: "https://images.example/work.jpg", alt_i18n: { cs: "Manikúra" }, sort_order: 0 }],
        service_name: "Manikúra",
        duration_minutes: 60,
        price_czk: 800,
        buffer_minutes: 15,
        currency: "CZK",
        public_link: "/beauty/beauty-0123456789abcdef",
        updated_at: "2026-08-01T09:00:00.000Z",
      }],
      error: null,
    }));
    const client = { rpc } as unknown as SupabaseClient;

    const result = await loadProfessionalDirectory("olomouc", "cs", { client, browserMock: false });

    expect(rpc).toHaveBeenCalledWith("go_irl_list_public_beauty_professionals_v3", {
      p_requested_city_id: "olomouc",
      p_language: "cs",
    });
    expect(result).toEqual([expect.objectContaining({
      displayName: "Studio Server",
      description: "Český popis",
      instagramUrl: "https://instagram.com/studio-server",
      experience: "8 let praxe",
      serviceName: "Manikúra",
      serviceId: "00000000-0000-4000-8000-000000000002",
      priceCzk: 800,
      bufferMinutes: 15,
      currency: "CZK",
      portfolio: [{ id: "work-1", imageUrl: "https://images.example/work.jpg", alt: "Manikúra" }],
    })]);
    expect(result[0]).not.toHaveProperty("contact");
    expect(result[0]).not.toHaveProperty("exactAddress");
  });

  it("falls back through v2 to the legacy public RPC before migrations are applied", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function" } })
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function" } })
      .mockResolvedValueOnce({ data: [], error: null });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(loadProfessionalDirectory("olomouc", "ru", { client, browserMock: false })).resolves.toEqual([]);
    expect(rpc).toHaveBeenNthCalledWith(3, "go_irl_list_public_beauty_professionals", {
      p_requested_city_id: "olomouc",
    });
  });

  it("does not silently replace a server error with fixtures", async () => {
    const client = {
      rpc: vi.fn(async () => ({ data: null, error: new Error("unavailable") })),
    } as unknown as SupabaseClient;

    await expect(loadProfessionalDirectory("olomouc", "en", { client, browserMock: false }))
      .rejects.toThrow("unavailable");
  });

  it("uses a master label plus a short localized category description", () => {
    expect(professionalCountLabel("ru", 1)).toBe("мастер · красота и уход");
    expect(professionalCountLabel("ru", 5)).toBe("мастеров · красота и уход");
    expect(professionalCountLabel("cs", 0)).toBe("profesionálů · péče a vzhled");
  });
});
