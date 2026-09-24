import { requireEnv } from "../_shared/env.js";
import { isReminderWorkerAuthorized } from "../_shared/worker-authorization.js";
import { createVercelHandler } from "../_shared/vercel-handler.js";

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

export async function handleCityPostersMaintenance(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!isReminderWorkerAuthorized(request)) return json(401, { error: "unauthorized" });

  const body = await request.json().catch(() => ({})) as { limit?: number };
  const limit = Number.isInteger(body.limit) ? Math.max(1, Math.min(Number(body.limit), 200)) : 100;

  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${requireEnv("SUPABASE_URL")}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "maintain_city_poster_publications", limit }),
  });
  const payload = await response.text();
  return new Response(payload, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default createVercelHandler(handleCityPostersMaintenance);
