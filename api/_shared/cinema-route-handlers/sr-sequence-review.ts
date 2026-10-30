import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest, productionAdminAuthorizationDependencies } from "../admin-authorization.js";
import { readSrTop7SequenceReview, validateSrSequenceScope, type SrSequenceScope } from "../cinema-sr-sequence-readback.js";
import { requireEnv } from "../env.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

/** Admin-only diagnostic. No claim, RPC, SQL write, send or authorization. */
export async function handleCinemaSrSequenceReview(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const auth = await authorizeAdminRequest(request, productionAdminAuthorizationDependencies());
  if ("status" in auth) return json(auth.status, { error: auth.error });
  let scope: SrSequenceScope;
  try {
    const body = await request.text();
    if (body.length > 2000) return json(413, { error: "cinema_sr_sequence_body_too_large" });
    scope = validateSrSequenceScope(JSON.parse(body));
  } catch { return json(400, { error: "cinema_sr_sequence_scope_invalid" }); }
  try {
    const db = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [start, end] = scope.week_key.split("..");
    const result = await readSrTop7SequenceReview({
      catalog: async () => await db.from("cinema_catalog_movies")
        .select("id,city_id,selection_week_start,selection_week_end,rank,source_movie_key,readiness,publication_state,published_event_id", { count: "exact" })
        .eq("city_id", "olomouc").eq("selection_week_start", start).eq("selection_week_end", end)
        .in("rank", [1, 2, 3, 4, 5, 6, 7]).order("rank").range(0, 7),
      attempts: async scope => await db.from("cinema_sr_publication_attempts")
        .select("attempt_id,week_key,source_run_id,rank,catalog_movie_id,candidate_key,status,catalog_event_id,telegram_chat_id,telegram_message_id,provider_outcome,independent_receipt,started_at,finished_at", { count: "exact" })
        .eq("week_key", scope.week_key).eq("source_run_id", scope.source_run_id).order("rank").range(0, 7),
      events: async () => await db.from("city_posters_events")
        .select("id,city_id,status,published_at,metadata", { count: "exact" })
        .eq("city_id", "olomouc").eq("vertical", "cinema")
        .eq("metadata->cinemaCatalog->>selectionWeekStart", start)
        .eq("metadata->cinemaCatalog->>selectionWeekEnd", end)
        .in("metadata->cinemaCatalog->>rank", ["1", "2", "3", "4", "5", "6", "7"])
        .order("id").range(0, 100),
      telegram: async eventIds => await db.from("city_posters_telegram_publications")
        .select("event_id,city_id,telegram_chat_id,telegram_message_id,deleted_at,last_error,published_at", { count: "exact" })
        .in("event_id", [...eventIds]).order("event_id").range(0, 100),
    }, scope);
    return json(409, result);
  } catch { return json(503, { error: "cinema_sr_sequence_readback_unavailable" }); }
}

export default { fetch: handleCinemaSrSequenceReview };
