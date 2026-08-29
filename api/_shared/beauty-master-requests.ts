import {
  normalizeBeautyMasterRequest,
  type BeautyMasterRequestRow,
} from "./beauty-master-request-store.js";

export type { BeautyMasterRequestRow } from "./beauty-master-request-store.js";
export { GoogleSheetsMasterRequestStore } from "./google-sheets-master-request-store.js";

type N8nResponse = { requests?: unknown[] };

const endpoint = "https://n8n.realitka.pp.ua/webhook/7bca641f-556d-4d2a-a399-7a01d6f83397/grooming018-beauty-master-requests";

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
  return payload.requests
    .map(normalizeBeautyMasterRequest)
    .filter((row): row is BeautyMasterRequestRow => Boolean(row));
}
