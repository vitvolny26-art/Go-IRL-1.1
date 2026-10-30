import { handleCinemaApproval } from "../_shared/cinema-route-handlers/approval.js";
import { handleCinemaDailyPublish } from "../_shared/cinema-route-handlers/daily-publish.js";
import { handleCinemaSrCatalogPlan } from "../_shared/cinema-route-handlers/sr-catalog-plan.js";
import { handleCinemaSrPreflight } from "../_shared/cinema-route-handlers/sr-preflight.js";
import { handleCinemaSrSequenceReview } from "../_shared/cinema-route-handlers/sr-sequence-review.js";

const notFound = () => new Response(JSON.stringify({ error: "cinema_route_not_found" }), {
  status: 404,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

export default {
  async fetch(request: Request) {
    const pathname = new URL(request.url).pathname.replace(/\\/+$/, "");
    switch (pathname) {
      case "/api/cinema/approval": return handleCinemaApproval(request);
      case "/api/cinema/daily-publish": return handleCinemaDailyPublish(request);
      case "/api/cinema/sr-catalog-plan": return handleCinemaSrCatalogPlan(request);
      case "/api/cinema/sr-preflight": return handleCinemaSrPreflight(request);
      case "/api/cinema/sr-sequence-review": return handleCinemaSrSequenceReview(request);
      default: return notFound();
    }
  },
};
