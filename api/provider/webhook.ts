import { createVercelHandler } from "../_shared/vercel-handler.js";
import { handleProviderWebhook } from "../_shared/provider-webhook.js";
import { providerFromWebhookQuery } from "../_shared/provider-webhook-route.js";

export default createVercelHandler(async (request) => {
  const provider = providerFromWebhookQuery(new URL(request.url).searchParams.get("provider"));
  if (!provider) return new Response("not_found", { status: 404 });
  return handleProviderWebhook(provider, request);
});
