import { createClient } from "@supabase/supabase-js";
import { authorizeAdminRequest, productionAdminAuthorizationDependencies } from "../admin-authorization.js";
import { buildSrCatalogStagingPlan, type SrSourcePackage } from "../cinema-sr-catalog-staging-plan.js";
import {
  reconcileSrVerifiedVenueRegistry, requiredSrRegistrySourceIds,
  type SrSourceRegistryRow, type SrVenueRegistryRow,
} from "../cinema-sr-venue-registry.js";
import { requireEnv } from "../env.js";
import { selectSrSourceBindings } from "../cinema-sr-source-bindings.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

/** Admin-only READ-ONLY staging preview: no catalog write, claim, publication, or Telegram. */
export async function handleCinemaSrCatalogPlan(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const auth = await authorizeAdminRequest(request, productionAdminAuthorizationDependencies());
  if ("status" in auth) return json(auth.status, { error: auth.error });

  let packageData: SrSourcePackage;
  let required: string[];
  try {
    const body = await request.text();
    if (body.length > 1_500_000) return json(413, { error: "cinema_sr_source_package_too_large" });
    packageData = JSON.parse(body) as SrSourcePackage;
    required = requiredSrRegistrySourceIds(packageData);
  } catch (e) {
    return json(400, { error: e instanceof Error ? e.message : "cinema_sr_source_package_invalid" });
  }

  const db = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const bindings = selectSrSourceBindings(required);
    const sourceResult = await db.from("cinema_sources")
      .select("id,source_id,source_url,venue_id,timezone,enabled", { count: "exact" })
      .in("id", bindings.map(row => row.registry_row_id));
    if (sourceResult.error || sourceResult.count !== required.length ||
        sourceResult.data?.length !== required.length) {
      return json(409, { error: "cinema_sr_registry_source_readback_incomplete" });
    }
    const ids = [...new Set((sourceResult.data || []).map(row => String(row.venue_id)))];
    const venueResult = await db.from("cinema_venues")
      .select("id,source_id,city_id,name,slug,address,timezone,active", { count: "exact" })
      .in("id", ids);
    if (venueResult.error || venueResult.count !== ids.length || venueResult.data?.length !== ids.length) {
      return json(409, { error: "cinema_sr_registry_venue_readback_incomplete" });
    }
    const verified = reconcileSrVerifiedVenueRegistry(required,
      sourceResult.data as SrSourceRegistryRow[], venueResult.data as SrVenueRegistryRow[]);
    const plan = buildSrCatalogStagingPlan(packageData, verified);
    // A complete preview is still neither a write authorization nor a release grant.
    return json(200, plan);
  } catch (e) {
    return json(409, { error: e instanceof Error ? e.message : "cinema_sr_registry_unavailable" });
  }
}

export default { fetch: handleCinemaSrCatalogPlan };
