import { handleCinemaApproval } from "./approval.js";
import { handleCinemaDailyPublish } from "./daily-publish.js";
import { handleCinemaSrCatalogPlan } from "./sr-catalog-plan.js";
import { handleCinemaSrPreflight } from "./sr-preflight.js";
import { handleCinemaSrSequenceReview } from "./sr-sequence-review.js";

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
