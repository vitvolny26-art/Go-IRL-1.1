import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest, productionAdminAuthorizationDependencies } from "../_shared/admin-authorization.js";
import {
  materializeApprovedDailyCinemaCandidate,
  type CinemaDailyPublicationInput,
} from "../_shared/cinema-daily-candidate-publication.js";
import { requireEnv } from "../_shared/env.js";

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const adminClient = () => createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const errorStatus = (code: string) => {
  if (/invalid|translation_missing/.test(code)) return 400;
  if (/not_approved|identity_mismatch|schedule_changed|provider_already_distributed|slug_collision/.test(code)) return 409;
  if (/not_found|_load_failed/.test(code)) return 404;
  return 503;
};

export async function handleCinemaDailyPublish(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const authorization = await authorizeAdminRequest(request, productionAdminAuthorizationDependencies());
  if ("status" in authorization) return json(authorization.status, { error: authorization.error });

  let input: CinemaDailyPublicationInput;
  try {
    input = await request.json() as CinemaDailyPublicationInput;
  } catch {
    return json(400, { error: "cinema_daily_publication_body_invalid" });
  }

  try {
    const result = await materializeApprovedDailyCinemaCandidate({
      db: adminClient(),
      input,
      actorUserKey: authorization.userKey,
    });
    return json(result.idempotent ? 200 : 201, { ok: true, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 200) : "cinema_daily_publication_failed";
    console.error("cinema_daily_publication_failed", { code });
    return json(errorStatus(code), { error: code.split(":")[0] });
  }
}

export default {
  fetch(request: Request) {
    return handleCinemaDailyPublish(request);
  },
};
