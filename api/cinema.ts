import { handleCinemaApproval } from "./_shared/cinema-route-handlers/approval.js";
import { handleCinemaDailyPublish } from "./_shared/cinema-route-handlers/daily-publish.js";
import { handleCinemaSrCatalogPlan } from "./_shared/cinema-route-handlers/sr-catalog-plan.js";
import { handleCinemaSrPreflight } from "./_shared/cinema-route-handlers/sr-preflight.js";
import { handleCinemaSrSequenceReview } from "./_shared/cinema-route-handlers/sr-sequence-review.js";

const handlers = {
  approval: handleCinemaApproval,
  "daily-publish": handleCinemaDailyPublish,
  "sr-catalog-plan": handleCinemaSrCatalogPlan,
  "sr-preflight": handleCinemaSrPreflight,
  "sr-sequence-review": handleCinemaSrSequenceReview,
} as const;

const notFound = () => new Response(JSON.stringify({ error: "cinema_route_not_found" }), {
  status: 404,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

export default {
  async fetch(request: Request) {
    const incoming = new URL(request.url);
    const route = incoming.searchParams.get("route") as keyof typeof handlers | null;
    const handler = route ? handlers[route] : undefined;
    if (!handler) return notFound();

    const target = new URL(incoming);
    target.pathname = `/api/cinema/${route}`;
    target.searchParams.delete("route");
    return handler(new Request(target, request));
  },
};
