import { describe, expect, it, vi } from "vitest";
import { fetchBeautyMasterRequests } from "./beauty-master-requests.js";

const valid = {
  requestId: "GROOMING018-bd904925-3b35-45b8-b5aa-a324e79406b7",
  submittedAt: "28.08.2026 7:32:20",
  status: "new",
  sourceLanguage: "uk",
  profession: "nails",
  publicName: "Kateryna Konovalenko",
  city: "Přerov",
  translatedPayloadJson: "",
  normalizedWorkspacePayloadJson: "",
  translationValidationStatus: "",
};

describe("beauty master requests n8n bridge", () => {
  it("forwards only the existing bearer and normalizes the allow-listed response", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://n8n.realitka.pp.ua/webhook/7bca641f-556d-4d2a-a399-7a01d6f83397/grooming018-beauty-master-requests");
      expect(init?.headers).toMatchObject({ authorization: "Bearer trusted-jwt" });
      return new Response(JSON.stringify({ requests: [valid, { ...valid, status: "rejected" }, { requestId: "bad" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(fetchBeautyMasterRequests("Bearer trusted-jwt", fetcher as typeof fetch)).resolves.toEqual([valid]);
  });

  it("rejects calls without a bearer before network access", async () => {
    const fetcher = vi.fn();
    await expect(fetchBeautyMasterRequests("", fetcher as typeof fetch)).rejects.toThrow("beauty_master_requests_missing_bearer");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
