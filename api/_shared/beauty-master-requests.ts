export type BeautyMasterRequestRow = {
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

type N8nResponse = { requests?: unknown[] };

const endpoint = "https://n8n.realitka.pp.ua/webhook/grooming018-beauty-master-requests";
const requestIdPattern = /^GROOMING018-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: unknown) => typeof value === "string" ? value : "";

const normalizeRequest = (value: unknown): BeautyMasterRequestRow | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const requestId = text(row.requestId).trim();
  if (!requestIdPattern.test(requestId)) return null;
  const status = text(row.status).trim();
  if (status.toLowerCase() === "rejected") return null;
  return {
    requestId,
    submittedAt: text(row.submittedAt).trim(),
    status,
    sourceLanguage: text(row.sourceLanguage).trim(),
    profession: text(row.profession).trim(),
    publicName: text(row.publicName).trim(),
    city: text(row.city).trim(),
    translatedPayloadJson: text(row.translatedPayloadJson),
    normalizedWorkspacePayloadJson: text(row.normalizedWorkspacePayloadJson),
    translationValidationStatus: text(row.translationValidationStatus).trim(),
  };
};

export async function fetchBeautyMasterRequests(
  authorization: string,
  fetcher: typeof fetch = fetch,
): Promise<BeautyMasterRequestRow[]> {
  if (!authorization.startsWith("Bearer ")) throw new Error("beauty_master_requests_missing_bearer");
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: {
      authorization,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: "{}",
  });
  if (!response.ok) throw new Error("beauty_master_requests_upstream_failed");
  const payload = await response.json() as N8nResponse;
  if (!Array.isArray(payload.requests)) throw new Error("beauty_master_requests_invalid_upstream");
  return payload.requests.map(normalizeRequest).filter((row): row is BeautyMasterRequestRow => Boolean(row));
}
