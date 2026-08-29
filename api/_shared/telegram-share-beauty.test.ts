import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildTrustedBeautyCardFromRows,
  isBeautyShareSlug,
  loadBeautyShareArtwork,
  loadPublicBeautyRows,
  localizeBeautyServiceName,
} from "./telegram-share-beauty";

describe("Beauty Telegram share", () => {
  it("accepts legacy and editable namespaced English slugs", () => {
    expect(isBeautyShareSlug("beauty-06b9689e8b1ee69a")).toBe(true);
    expect(isBeautyShareSlug("beauty-test-studio")).toBe(true);
    expect(isBeautyShareSlug("test-studio")).toBe(false);
    expect(isBeautyShareSlug("Beauty Test Studio")).toBe(false);
  });

  it("localizes the manicure service in all system languages", () => {
    expect(localizeBeautyServiceName("Маникюр с гель-лаком", "ru")).toBe("Маникюр с гель-лаком");
    expect(localizeBeautyServiceName("Маникюр с гель-лаком", "uk")).toBe("Манікюр з гель-лаком");
    expect(localizeBeautyServiceName("Маникюр с гель-лаком", "cs")).toBe("Manikúra s gel lakem");
    expect(localizeBeautyServiceName("Маникюр с гель-лаком", "en")).toBe("Gel manicure");
    expect(localizeBeautyServiceName("Маникюр с гель-лаком", "pl")).toBe("Manicure hybrydowy");
    expect(localizeBeautyServiceName("Маникюр с гель-лаком", "sk")).toBe("Gélová manikúra");
  });

  it("builds one trusted Beauty card with profile description and up to three service rows", () => {
    const base = {
      profile_id: "profile-1",
      slug: "beauty-test-studio",
      display_name: "Studio Vita",
      city_id: "olomouc",
      public_location: "Центр, Оломоуц",
      description: "Маникюр и уход за ногтями",
      specialization: "Комбинированный маникюр и укрепление натуральных ногтей",
      duration_minutes: 60,
      currency: "CZK",
    };
    const card = buildTrustedBeautyCardFromRows([
      { ...base, service_name: "Маникюр с гель-лаком", price_czk: 890 },
      { ...base, service_name: "Педикюр", price_czk: 990 },
      { ...base, service_name: "Nail art", price_czk: 250 },
      { ...base, service_name: "Ignored fourth service", price_czk: 1 },
    ], "beauty-test-studio", "ru", "2026-08-05", "https://go-irl.fun");

    expect(card?.activity).toBe("Studio Vita");
    expect(card?.description).toBe("Комбинированный маникюр и укрепление натуральных ногтей");
    expect(card?.beautyServices).toEqual([
      { name: "Маникюр с гель-лаком", priceCzk: 890 },
      { name: "Педикюр", priceCzk: 990 },
      { name: "Nail art", priceCzk: 250 },
    ]);
    expect(card?.publicProfileUrl).toBe("https://go-irl.fun/beauty/beauty-test-studio");
  });

  it("uses the requested localized saved ready JPEG as the canonical Beauty artwork", async () => {
    const maybeSingle = vi.fn(async () => ({
      data: {
        status: "ready",
        generated_object_path: "user-1/beauty-share-card/generated/fingerprint-1/telegram/en.jpg",
        source_fingerprint: "fingerprint-1",
        generated_at: "2026-08-06T00:00:00.000Z",
        updated_at: "2026-08-06T00:00:01.000Z",
      },
      error: null,
    }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const getPublicUrl = vi.fn((path: string) => ({
      data: { publicUrl: `https://storage.example/beauty-share-cards/${path}` },
    }));
    const storageFrom = vi.fn(() => ({ getPublicUrl }));
    const client = {
      from,
      storage: { from: storageFrom },
    } as unknown as SupabaseClient;

    await expect(loadBeautyShareArtwork(client, "profile-1", "pl")).resolves.toEqual({
      imageUrl: "https://storage.example/beauty-share-cards/user-1/beauty-share-card/generated/fingerprint-1/telegram/pl.jpg?v=fingerprint-1",
      version: "fingerprint-1",
      generatedAt: "2026-08-06T00:00:00.000Z",
    });
    expect(from).toHaveBeenCalledWith("beauty_share_cards");
    expect(eq).toHaveBeenCalledWith("profile_id", "profile-1");
    expect(storageFrom).toHaveBeenCalledWith("beauty-share-cards");
    expect(getPublicUrl).toHaveBeenCalledWith("user-1/beauty-share-card/generated/fingerprint-1/telegram/pl.jpg");
  });

  it("does not expose artwork that is not ready", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { status: "updating" }, error: null }),
          }),
        }),
      }),
      storage: { from: vi.fn() },
    } as unknown as SupabaseClient;

    await expect(loadBeautyShareArtwork(client, "profile-1", "ru")).resolves.toBeNull();
  });

  it("uses the same current public Beauty projection as the Services directory", async () => {
    const row = { slug: "beauty-test-studio" };
    const rpc = vi.fn(async () => ({ data: [row], error: null }));

    await expect(loadPublicBeautyRows({ rpc } as unknown as SupabaseClient, "ru")).resolves.toEqual([row]);
    expect(rpc).toHaveBeenCalledWith("go_irl_list_public_beauty_professionals_v3", {
      p_requested_city_id: "olomouc",
      p_language: "ru",
    });
  });

  it("keeps the legacy Beauty projection as a compatibility fallback", async () => {
    const missing = { code: "PGRST202", message: "Could not find the function" };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: missing })
      .mockResolvedValueOnce({ data: null, error: missing })
      .mockResolvedValueOnce({ data: [{ slug: "beauty-legacy" }], error: null });

    await expect(loadPublicBeautyRows({ rpc } as unknown as SupabaseClient, "en"))
      .resolves.toEqual([{ slug: "beauty-legacy" }]);
    expect(rpc).toHaveBeenNthCalledWith(3, "go_irl_list_public_beauty_professionals", {
      p_requested_city_id: "olomouc",
    });
  });
});
