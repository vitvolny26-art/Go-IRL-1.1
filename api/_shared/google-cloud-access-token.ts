export const googleSheetsReadonlyScope = "https://www.googleapis.com/auth/spreadsheets.readonly";
const metadataTokenEndpoint = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

type MetadataTokenResponse = {
  access_token?: unknown;
};

export async function fetchGoogleCloudAccessToken(
  scope: string = googleSheetsReadonlyScope,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const url = new URL(metadataTokenEndpoint);
  url.searchParams.set("scopes", scope);
  const response = await fetcher(url, {
    method: "GET",
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!response.ok) throw new Error("google_cloud_access_token_failed");
  const payload = await response.json() as MetadataTokenResponse;
  if (typeof payload.access_token !== "string" || !payload.access_token.trim()) {
    throw new Error("google_cloud_access_token_invalid");
  }
  return payload.access_token;
}
