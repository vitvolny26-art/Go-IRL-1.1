import { getTrustedAccessToken } from "../authSession";

export type BeautyMasterRequestSummary = {
  requestId: string;
  submittedAt: string;
  status: string;
  sourceLanguage: string;
  profession: string;
  publicName: string;
  city: string;
  translatedPayloadJson: string;
  normalizedWorkspacePayloadJson: string;
  translationValidationStatus: string;
};

type BeautyMasterRequestsResponse = {
  error?: string;
  beautyMasterRequests?: BeautyMasterRequestSummary[];
};

type BeautyMasterRequestsDependencies = {
  accessToken?: string | null;
  endpoint?: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
};

const requestIdPattern = /^GROOMING018-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const beautyMasterAdminRequestUrl = (requestId: string, origin = window.location.origin) => {
  if (!requestIdPattern.test(requestId.trim())) throw new Error("beauty_master_requests_invalid_request_id");
  const url = new URL("/admin", origin);
  url.searchParams.set("beauty_request", requestId.trim());
  return url.toString();
};

export const requestedBeautyMasterRequestId = (url = window.location.href) => {
  const requestId = new URL(url).searchParams.get("beauty_request")?.trim() || "";
  return requestIdPattern.test(requestId) ? requestId : "";
};

const isRequest = (value: unknown): value is BeautyMasterRequestSummary => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.requestId === "string"
    && requestIdPattern.test(row.requestId.trim())
    && typeof row.submittedAt === "string"
    && typeof row.status === "string"
    && typeof row.sourceLanguage === "string"
    && typeof row.profession === "string"
    && typeof row.publicName === "string"
    && typeof row.city === "string"
    && typeof row.translatedPayloadJson === "string"
    && typeof row.normalizedWorkspacePayloadJson === "string"
    && typeof row.translationValidationStatus === "string";
};

export const preferredBeautyMasterPayloadJson = (request: BeautyMasterRequestSummary) =>
  request.normalizedWorkspacePayloadJson.trim() || request.translatedPayloadJson.trim();

export async function requestBeautyMasterRequests(
  dependencies: BeautyMasterRequestsDependencies = {},
): Promise<BeautyMasterRequestSummary[]> {
  const fetcher = dependencies.fetcher || fetch;
  const getAccessToken = dependencies.getAccessToken || getTrustedAccessToken;
  const accessToken = dependencies.accessToken ?? await getAccessToken();
  if (!accessToken) throw new Error("trusted_session_required");

  const response = await fetcher(dependencies.endpoint || "/api/admin/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: "list_beauty_master_requests" }),
  });
  const payload = await response.json() as BeautyMasterRequestsResponse;
  if (!response.ok) throw new Error(payload.error || "beauty_master_requests_failed");
  if (!Array.isArray(payload.beautyMasterRequests)) throw new Error("beauty_master_requests_invalid_response");
  return payload.beautyMasterRequests.filter(isRequest);
}
