import { createVercelHandler } from "../../_shared/vercel-handler.js";
import { handleProviderWebhook } from "../../_shared/provider-webhook.js";
import { providerFromWebhookPath } from "../../_shared/provider-webhook-route.js";

export default createVercelHandler(async (request) => {
  const provider = providerFromWebhookPath(new URL(request.url).pathname);
  if (!provider) return new Response("not_found", { status: 404 });
  return handleProviderWebhook(provider, request);
});
