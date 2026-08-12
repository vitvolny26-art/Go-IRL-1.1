import { authorizeAdminRequest, productionAdminAuthorizationDependencies } from "../_shared/admin-authorization.js";
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
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    return json(200, { authorized: true });
  } catch (error) {
    console.error("admin_login_failed", {
      reason: error instanceof Error ? error.message.slice(0, 80) : "unknown",
    });
    return json(503, { error: "access_denied" });
  }
}

export default createVercelHandler(handleAdminSession);
