import { requireEnv } from "../_shared/env.js";
import { createVercelHandler } from "../_shared/vercel-handler.js";

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

export async function handleTelegramCommunicationVerification(
  request: Request,
  fetchImpl: typeof fetch = fetch,
) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!accessToken) return json(401, { error: "trusted_session_required" });

  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const identityResponse = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/go_irl_auth_user_key`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!identityResponse.ok) return json(401, { error: "trusted_session_invalid" });

  const userKey = await identityResponse.json() as string | null;
  if (!userKey || !userKey.startsWith("telegram:")) {
    return json(409, { error: "telegram_verification_identity_unavailable" });
  }

  const verificationResponse = await fetchImpl(`${supabaseUrl}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "send_communication_verification_requests",
      userKeys: [userKey],
    }),
  });
  if (!verificationResponse.ok) {
    return json(502, { error: "telegram_verification_request_failed" });
  }

  return json(200, { ok: true });
}

export default createVercelHandler(handleTelegramCommunicationVerification);
