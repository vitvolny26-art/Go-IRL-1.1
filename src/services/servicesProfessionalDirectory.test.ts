import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  clearProfessionalDirectoryCache,
  loadAvailableServicesCityIds,
  loadProfessionalDirectory,
  professionalCountLabel,
  professionalProfileCount,
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

  it("keeps only cities with confirmed public professionals", async () => {
    const rowFor = (cityId: string) => ({
      profile_id: `profile-${cityId}`,
      service_id: `service-${cityId}`,
      slug: `beauty-${cityId}`,
      display_name: `Studio ${cityId}`,
      city_id: cityId,
      public_location: cityId,
      service_name: "Service",
      duration_minutes: 60,
      price_czk: 500,
      currency: "CZK" as const,
      public_link: `/beauty/beauty-${cityId}`,
      updated_at: "2026-08-31T00:00:00.000Z",
    });
    const rpc = vi.fn(async (_name: string, args: { p_requested_city_id?: string }) => {
      const cityId = args.p_requested_city_id || "";
      if (cityId === "praha") return { data: null, error: new Error("temporary") };
      if (cityId === "olomouc" || cityId === "prerov") return { data: [rowFor(cityId)], error: null };
      return { data: [], error: null };
    });
    const client = { rpc } as unknown as SupabaseClient;

    await expect(loadAvailableServicesCityIds(
      ["olomouc", "prerov", "brno", "praha"],
      "en",
      { client, browserMock: false },
    )).resolves.toEqual(["olomouc", "prerov"]);
  });

  it("uses the latest localized city directory and counts unique profiles instead of service rows", async () => {
    clearProfessionalDirectoryCache();
    const rowFor = (profileId: string, serviceId: string) => ({
      profile_id: profileId,
      service_id: serviceId,
      slug: `beauty-${profileId}`,
      display_name: `Studio ${profileId}`,
      city_id: "olomouc",
      public_location: "Olomouc",
      service_name: `Service ${serviceId}`,
      duration_minutes: 60,
      price_czk: 500,
      currency: "CZK" as const,
      public_link: `/beauty/beauty-${profileId}`,
      updated_at: "2026-09-01T00:00:00.000Z",
    });
    const client = {
      rpc: vi.fn(async () => ({
        data: [
          rowFor("profile-a", "service-a-1"),
          rowFor("profile-a", "service-a-2"),
          rowFor("profile-b", "service-b-1"),
        ],
        error: null,
      })),
    } as unknown as SupabaseClient;

    await loadProfessionalDirectory("olomouc", "cs", { client, browserMock: false });

    expect(professionalsForCity("olomouc").map((professional) => professional.profileId)).toEqual([
      "profile-a",
      "profile-b",
    ]);
  });

  it("counts distinct professional profiles instead of service rows", () => {
    const [base] = sharedMockProfessionals;
    expect(professionalProfileCount([
      { ...base, profileId: "profile-a", serviceId: "service-a-1" },
      { ...base, profileId: "profile-a", serviceId: "service-a-2" },
      { ...base, profileId: "profile-b", serviceId: "service-b-1" },
    ])).toBe(2);
  });

  it("uses a master label plus a fuller localized Grooming description", () => {
    expect(professionalCountLabel("ru", 1)).toBe("мастер · Волосы, кожа, ногти и другие услуги по уходу за собой");
    expect(professionalCountLabel("ru", 5)).toBe("мастеров · Волосы, кожа, ногти и другие услуги по уходу за собой");
    expect(professionalCountLabel("cs", 0)).toBe("profesionálů · Vlasy, pleť, nehty a další služby osobní péče");
  });
});
