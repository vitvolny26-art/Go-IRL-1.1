import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest, productionAdminAuthorizationDependencies } from "../_shared/admin-authorization.js";
import { evaluateSrHandoff, validateSrHandoff } from "../_shared/cinema-sr-publication-preflight.js";
import { prepareSrPolicyHandoff } from "../_shared/cinema-sr-policy-handoff.js";
import { requireEnv } from "../_shared/env.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

/** Authenticated, READ-ONLY preflight. No SQL writes, claim, City Posters or Telegram. */
export async function handleCinemaSrPreflight(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const auth = await authorizeAdminRequest(request, productionAdminAuthorizationDependencies());
  if ("status" in auth) return json(auth.status, { error: auth.error });

  let input;
  try { input = validateSrHandoff(await request.json()); }
  catch (e) { return json(400, { error: e instanceof Error ? e.message : "cinema_sr_body_invalid" }); }

  const db = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const movie = await db.from("cinema_catalog_movies")
      .select("id,city_id,selection_week_start,selection_week_end,rank,source_movie_key,poster_url,translations,readiness,publication_state")
      .eq("id", input.catalog_movie_id).single();
    if (movie.error || !movie.data) return json(409, { error: "cinema_sr_catalog_readback_failed" });
    // Count every matching screening. A default result limit must never look like full coverage.
    const rows = await db.from("cinema_catalog_screenings")
      .select("catalog_movie_id,source_screening_key,cinema_key,venue_timezone,starts_at,source_id,source_url", { count: "exact" })
      .eq("catalog_movie_id", input.catalog_movie_id)
      .order("starts_at", { ascending: true })
      .order("source_screening_key", { ascending: true })
      .range(0, 1000);
    if (rows.error || !rows.data || rows.count === null || rows.count !== rows.data.length || rows.count > 1000) {
      return json(409, { error: "cinema_sr_screening_readback_incomplete" });
    }
    const evaluation = evaluateSrHandoff(input, movie.data, rows.data);
    const policy = prepareSrPolicyHandoff(input, evaluation);
    return json(evaluation.evidence_complete ? 200 : 409, { ...evaluation, policy });
  } catch {
    return json(503, { error: "cinema_sr_readback_unavailable" });
  }
}

export default { fetch: handleCinemaSrPreflight };
