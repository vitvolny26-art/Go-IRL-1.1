import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edge = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url),
  "utf8",
);
const workflow = readFileSync(
  new URL("../.github/workflows/city-posters-exact-publish.yml", import.meta.url),
  "utf8",
);

describe("AFISHI007 exact City Posters manual dispatch", () => {
  it("accepts only a bounded explicit unique UUID list through service-role auth", () => {
    expect(edge).toContain('action === "publish_city_poster_events"');
    expect(edge).toContain("exactCityPostersServiceRoleAuthorized = apiKeyServiceRoleAuthorized || bearerServiceRoleAuthorized");
    expect(edge).toContain('safeEqual(authorization, `Bearer ${serviceRoleKey}`)');
    expect(edge).toContain('error: "city_posters_service_role_required"');
    expect(edge).toContain("status: 403");
    expect(edge).toContain("Array.isArray(body?.eventIds)");
    expect(edge).toContain("new Set(");
    expect(edge).toContain("eventIds.length !== body?.eventIds?.length");
    expect(edge).toContain("eventIds.length > 20");
    expect(edge).toContain("city_posters_publish_targets_invalid");
  });

  it("publishes only the explicitly supplied event IDs through the existing idempotent publisher", () => {
    expect(edge).toContain("for (const eventId of eventIds)");
    expect(edge).toContain("publishCityPosterEvent({ supabase, telegramApi: telegram, eventId, language: body?.language })");
    expect(edge).toContain("cityPosterPublications: results");
    expect(edge).toContain('.select("id,status,published_at").in("id", eventIds)');
    expect(edge).toContain('!["ready", "published"].includes');
    expect(edge).toContain('error: "city_posters_publish_targets_not_ready"');
    expect(edge).toContain('.update({ status: "published", published_at: new Date().toISOString() })');
    expect(edge).toContain('.eq("status", "ready")');
    expect(edge).not.toContain('.update({ status: "ready", published_at: target.published_at })');
    expect(edge).toContain("Telegram is downstream");
    expect(edge).toContain("city_posters_exact_publish_failed");
    expect(edge).toContain("boundedProxyDiagnosticText(error.message)");
    expect(edge).toContain('if (!result.published) throw new Error');
    expect(edge).toContain("rollbackCityPosterPublication");
    expect(edge).toContain("city_poster_publish_message_rollback_failed");
  });

  it("does not depend on the broken Vercel worker-secret transport", () => {
    const exactAction = edge.slice(
      edge.indexOf('action === "publish_city_poster_events"'),
      edge.indexOf('action === "publish_city_poster_event"'),
    );
    expect(exactAction).not.toContain("REMINDER_WORKER_SECRET");
    expect(exactAction).not.toContain("maintain_city_poster_publications");
    expect(exactAction).not.toContain("/api/city-posters/maintenance");
  });

  it("reports only bounded Edge diagnostics when the production invocation fails", () => {
    expect(workflow).toContain('headers_file="$(mktemp)"');
    expect(workflow).toContain('--dump-header "$headers_file"');
    expect(workflow).toContain("publication_http_status=");
    expect(workflow).toContain("publication_edge_error=");
    expect(workflow).toContain("publication_sb_error_code=");
    expect(workflow).not.toContain('cat "$response_file"');
  });
});
