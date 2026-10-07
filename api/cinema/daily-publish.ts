import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest, productionAdminAuthorizationDependencies } from "../_shared/admin-authorization.js";
import {
  finalizeDailyCinemaCandidatePublication,
  materializeApprovedDailyCinemaCandidate,
  resetDailyCinemaCandidateAfterProviderFailure,
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

const publishTelegramCinemaEvent = async (eventId: string) => {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      action: "publish_city_poster_events",
      eventIds: [eventId],
      language: "ru",
    }),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok !== true) {
    throw new Error("cinema_daily_publication_telegram_failed");
  }
  return payload;
};

const exactTelegramMessageId = (payload: Record<string, unknown>, eventId: string) => {
  const rows = Array.isArray(payload.cityPosterPublications) ? payload.cityPosterPublications : [];
  if (rows.length !== 1) throw new Error("cinema_daily_publication_telegram_identity_invalid");
  const row = rows[0] as Record<string, unknown>;
  const result = row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : null;
  const messageId = Number(result?.messageId);
  if (row.eventId !== eventId || result?.published !== true || result?.reused === true || !Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new Error("cinema_daily_publication_telegram_identity_invalid");
  }
  return messageId;
};

const rollbackTelegramCinemaEvent = async (eventId: string, messageId: number) => {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ action: "rollback_city_poster_event", eventId, messageId }),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok !== true || payload?.rolledBack !== true) {
    throw new Error("cinema_daily_publication_telegram_rollback_failed");
  }
};

const errorStatus = (code: string) => {
  if (/invalid|translation_missing/.test(code)) return 400;
  if (/owner_approval_required|not_ready|provider_already_distributed|state_changed/.test(code)) return 409;
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
    const db = adminClient();
    const result = await materializeApprovedDailyCinemaCandidate({
      db,
      input,
      actorUserKey: authorization.userKey,
    });
    const telegram = await publishTelegramCinemaEvent(result.event_id).catch(async (error) => {
      await resetDailyCinemaCandidateAfterProviderFailure({
        db,
        catalogMovieId: result.catalog_movie_id,
        eventId: result.event_id,
      });
      throw error;
    });
    const telegramMessageId = exactTelegramMessageId(telegram, result.event_id);
    try {
      await finalizeDailyCinemaCandidatePublication({
        db,
        catalogMovieId: result.catalog_movie_id,
        eventId: result.event_id,
        actorUserKey: authorization.userKey,
      });
    } catch (error) {
      try {
        await rollbackTelegramCinemaEvent(result.event_id, telegramMessageId);
      } catch {
        throw new Error("cinema_daily_publication_finalize_failed_cleanup_required");
      }
      await resetDailyCinemaCandidateAfterProviderFailure({
        db,
        catalogMovieId: result.catalog_movie_id,
        eventId: result.event_id,
      });
      throw error;
    }
    return json(result.idempotent ? 200 : 201, { ok: true, ...result, telegram });
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
