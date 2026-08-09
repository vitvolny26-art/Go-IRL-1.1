import type { AccountRequestTransport } from "./accountRequest";
import { getTrustedAccessToken } from "./authSession";

type AccountRequestTransportDependencies = {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
  supabaseUrl?: string;
  publishableKey?: string;
};

export const createAccountRequestTransport = ({
  fetchImpl = fetch,
  getAccessToken = getTrustedAccessToken,
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL,
  publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
}: AccountRequestTransportDependencies = {}): AccountRequestTransport => async (input) => {
  if (!supabaseUrl || !publishableKey) throw new Error("account_request_transport_unavailable");

  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("account_request_session_required");

  const response = await fetchImpl(`${supabaseUrl}/functions/v1/accountRequest`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await response.json() as {
    request?: { id?: unknown };
    error?: unknown;
  };
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "account_request_failed");
  }

  const requestId = typeof payload.request?.id === "string" ? payload.request.id.trim() : "";
  if (!requestId) throw new Error("account_request_invalid_response");

  return { requestId };
};

export const accountRequestEndpoint = "accountRequest";
