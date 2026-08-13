import { AccountRequestTransportError, type AccountRequestTransport } from "./accountRequest";
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

  type ResponsePayload = {
    request?: { id?: unknown };
    accountDeleted?: unknown;
    cleanupPending?: unknown;
    error?: unknown;
  };

  let payload: ResponsePayload;
  try {
    payload = await response.json() as ResponsePayload;
  } catch {
    if (!response.ok) {
      throw new AccountRequestTransportError("account_request_failed", response.status, null);
    }
    throw new Error("account_request_invalid_response");
  }
  if (!response.ok) {
    const backendCode = typeof payload.error === "string" ? payload.error : null;
    throw new AccountRequestTransportError(
      backendCode || "account_request_failed",
      response.status,
      backendCode,
    );
  }

  const requestId = typeof payload.request?.id === "string" ? payload.request.id.trim() : "";
  if (!requestId) throw new Error("account_request_invalid_response");

  return {
    requestId,
    ...(payload.accountDeleted === true ? { accountDeleted: true } : {}),
    ...(payload.cleanupPending === true ? { cleanupPending: true } : {}),
  };
};

export const accountRequestEndpoint = "accountRequest";
