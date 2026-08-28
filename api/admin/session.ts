import { authorizeAdminRequest, productionAdminAuthorizationDependencies } from "../_shared/admin-authorization.js";
import { executeAdminRoleAction, productionAdminRoleActionDependencies, type AdminRoleAction } from "../_shared/admin-role-actions.js";
import { fetchBeautyMasterRequests } from "../_shared/beauty-master-requests.js";
import { checkInstagramPublisherReadiness } from "../_shared/instagram-publisher-readiness.js";
import { publishSocialEvent, type SocialPublishLanguage, type SocialPublishTarget } from "../_shared/social-publishing.js";
import { createVercelHandler } from "../_shared/vercel-handler.js";

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

const INSTAGRAM_READINESS_PROBE = "instagram-publisher-readiness";
const SOCIAL_PUBLISH_PROBE = "social-publish-event";
const BEAUTY_MASTER_REQUESTS_ACTION = "list_beauty_master_requests";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roleActions = new Set<AdminRoleAction>([
  "create_role_invitation",
  "list_role_assignments",
  "demote_role",
  "reassign_activity_organizer",
]);

async function handleInstagramPublisherReadiness(request: Request) {
  try {
    const authorization = await authorizeAdminRequest(
      request,
      productionAdminAuthorizationDependencies(),
    );
    if ("status" in authorization) return json(authorization.status, { error: authorization.error });

    return json(200, await checkInstagramPublisherReadiness());
  } catch (error) {
    console.error("instagram_publisher_readiness_failed", {
      reason: error instanceof Error ? error.message.slice(0, 80) : "unknown",
    });
    return json(503, { error: "instagram_publisher_readiness_failed" });
  }
}

export async function handleAdminSession(request: Request) {
  const probe = new URL(request.url).searchParams.get("probe");
  if (probe === SOCIAL_PUBLISH_PROBE) {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const raw = await request.json().catch(() => null) as Record<string, unknown> | null;
    const eventId = typeof raw?.eventId === "string" ? raw.eventId.trim() : "";
    const language: SocialPublishLanguage = raw?.language === "ru" || raw?.language === "uk" || raw?.language === "cs" || raw?.language === "en" ? raw.language : "cs";
    const targets = Array.isArray(raw?.targets) ? [...new Set(raw.targets.filter((item): item is SocialPublishTarget => item === "facebook" || item === "instagram"))] : ["facebook", "instagram"] as SocialPublishTarget[];
    if (!uuid.test(eventId) || !targets.length) return json(400, { error: "invalid_request" });
    const auth = await authorizeAdminRequest(request, productionAdminAuthorizationDependencies());
    if ("status" in auth) return json(auth.status, { error: auth.error });
    try { return json(200, { eventId, ...(await publishSocialEvent({ eventId, language, targets })) }); } catch (error) { console.error("social_publish_failed", { reason: error instanceof Error ? error.message.slice(0, 80) : "unknown" }); return json(503, { error: "social_publish_failed" }); }
  }
  if (probe === INSTAGRAM_READINESS_PROBE) {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { Allow: "GET" } });
    }
    return handleInstagramPublisherReadiness(request);
  }

  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  try {
    const result = await authorizeAdminRequest(request, productionAdminAuthorizationDependencies());
    if ("status" in result) return json(result.status, { error: result.error });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const action = typeof body?.action === "string" ? body.action : "session";
    if (action === "session") return json(200, { authorized: true, user: { role: result.role } });
    if (action === BEAUTY_MASTER_REQUESTS_ACTION) {
      if (result.role !== "superadmin") return json(403, { error: "access_denied" });
      try {
        const authorization = request.headers.get("authorization") || "";
        return json(200, { beautyMasterRequests: await fetchBeautyMasterRequests(authorization) });
      } catch (error) {
        console.error("beauty_master_requests_failed", {
          reason: error instanceof Error ? error.message.slice(0, 80) : "unknown",
        });
        return json(503, { error: "beauty_master_requests_unavailable" });
      }
    }
    if (!roleActions.has(action as AdminRoleAction)) return json(400, { error: "invalid_action" });

    const actionResult = await executeAdminRoleAction(
      result,
      {
        action: action as AdminRoleAction,
        activityId: typeof body?.activityId === "string" ? body.activityId : undefined,
        targetRole: typeof body?.targetRole === "string" ? body.targetRole : undefined,
        targetUserKey: typeof body?.targetUserKey === "string" ? body.targetUserKey : undefined,
      },
      productionAdminRoleActionDependencies(),
    );
    return json(actionResult.status, actionResult.payload);
  } catch (error) {
    console.error("admin_login_failed", {
      reason: error instanceof Error ? error.message.slice(0, 80) : "unknown",
    });
    return json(503, { error: "access_denied" });
  }
}

export default createVercelHandler(handleAdminSession);
