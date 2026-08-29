import { describe, expect, it, vi } from "vitest";
import { parseBeautyMasterRequestSheetValues } from "./beauty-master-request-store.js";
import { fetchGoogleCloudAccessToken, googleSheetsReadonlyScope } from "./google-cloud-access-token.js";
import { GoogleSheetsMasterRequestStore } from "./google-sheets-master-request-store.js";

const headers = [
  "request_id", "submitted_at", "status", "source_language", "profession", "requester_user_key",
  "public_name", "city", "public_location", "contact", "exact_address", "instagram_url", "description",
  "experience", "specialization_text", "hygiene", "materials", "spoken_languages", "certificates",
  "booking_notes", "service_1_name", "duration_minutes", "price_czk", "buffer_minutes", "weekdays",
  "start_time", "end_time", "break_enabled", "break_start", "break_end", "portfolio_urls",
  "extra_services_json", "superadmin_notes", "ai_prompt", "translated_payload_json",
  "workspace_import_status", "normalized_workspace_payload_json", "translation_validation_status",
];

const row = (requestId: string, status = "approved") => headers.map((header) => ({
  request_id: requestId,
  submitted_at: "2026-08-29T08:00:00Z",
  status,
  source_language: "ru",
  profession: "barber",
  public_name: "Master",
  city: "Prerov",
  translated_payload_json: "{\"ok\":true}",
  normalized_workspace_payload_json: "{\"workspace\":true}",
  translation_validation_status: "valid",
} as Record<string, string>)[header] ?? "");

describe("GoogleSheetsMasterRequestStore", () => {
  it("maps Requests values by header names and filters rejected or invalid rows", () => {
    expect(parseBeautyMasterRequestSheetValues([
      headers,
      row("GROOMING018-bd904925-3b35-45b8-b5aa-a324e79406b7"),
      row("GROOMING018-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "rejected"),
      row("invalid-id"),
    ])).toEqual([expect.objectContaining({
      requestId: "GROOMING018-bd904925-3b35-45b8-b5aa-a324e79406b7",
      profession: "barber",
      publicName: "Master",
      city: "Prerov",
    })]);
  });

  it("calls Sheets REST with a service-identity access token", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ values: [headers] }), { status: 200 }));
    const store = new GoogleSheetsMasterRequestStore({
      fetcher: fetcher as typeof fetch,
      accessTokenProvider: async () => "service-identity-token",
    });
    await expect(store.listRequests()).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain("https://sheets.googleapis.com/v4/spreadsheets/1WGQ7Mdhy25qxqVDBlmEa_2mXnpamk4geqKT5s8Zw5qE/values/Requests!A%3AAL");
    expect(init?.headers).toEqual({ authorization: "Bearer service-identity-token", accept: "application/json" });
  });

  it("requests a short-lived scoped token from the Google metadata server", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: "token", expires_in: 3599, token_type: "Bearer" }), { status: 200 }));
    await expect(fetchGoogleCloudAccessToken(undefined, fetcher as typeof fetch)).resolves.toBe("token");
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain("metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token");
    expect(String(url)).toContain(`scopes=${encodeURIComponent(googleSheetsReadonlyScope)}`);
    expect(init?.headers).toEqual({ "Metadata-Flavor": "Google" });
  });
});
