import type { MessagingProvider } from "./provider-messages.js";

const providerSet = new Set<MessagingProvider>(["instagram", "messenger", "whatsapp"]);

export function providerFromWebhookPath(pathname: string): MessagingProvider | null {
  const [, apiSegment, provider, action] = pathname.split("/");
  if (apiSegment !== "api" || action !== "webhook") return null;
  return providerSet.has(provider as MessagingProvider) ? provider as MessagingProvider : null;
}
