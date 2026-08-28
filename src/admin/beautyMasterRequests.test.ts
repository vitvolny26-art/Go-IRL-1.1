import { describe, expect, it, vi } from "vitest";
import { preferredBeautyMasterPayloadJson, requestBeautyMasterRequests } from "./beautyMasterRequests";

const requestId = "GROOMING018-bd904925-3b35-45b8-b5aa-a324e79406b7";
const request = {
  requestId,
  submittedAt: "28.08.2026 7:32:20",
  status: "new",
  sourceLanguage: "uk",
  profession: "nails",
  publicName: "Kateryna Konovalenko",
  city: "Přerov",
  translatedPayloadJson: "translated",
  normalizedWorkspacePayloadJson: "normalized",
  translationValidationStatus: "",
};

describe("beauty master request intake client", () => {
  it("loads requests through the trusted admin action", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
        authorization: "Bearer trusted-jwt",
      });
      expect(JSON.parse(String(init?.body))).toEqual({ action: "list_beauty_master_requests" });
      return new Response(JSON.stringify({ beautyMasterRequests: [request] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(requestBeautyMasterRequests({ accessToken: "trusted-jwt", fetcher: fetcher as typeof fetch }))
      .resolves.toEqual([request]);
  });

  it("fails closed when there is no trusted admin token", async () => {
    const fetcher = vi.fn();
    await expect(requestBeautyMasterRequests({
      accessToken: null,
      getAccessToken: async () => null,
      fetcher: fetcher as typeof fetch,
    })).rejects.toThrow("trusted_session_required");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("prefers the normalized approved payload over the translated draft", () => {
    expect(preferredBeautyMasterPayloadJson(request)).toBe("normalized");
    expect(preferredBeautyMasterPayloadJson({ ...request, normalizedWorkspacePayloadJson: "" })).toBe("translated");
  });
});
