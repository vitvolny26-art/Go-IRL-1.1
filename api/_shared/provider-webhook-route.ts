import type { MessagingProvider } from "./provider-messages.js";

const providerSet = new Set<MessagingProvider>(["instagram", "messenger", "whatsapp"]);

export function providerFromWebhookQuery(value: string | null): MessagingProvider | null {
  if (!value) return null;
  return providerSet.has(value as MessagingProvider) ? value as MessagingProvider : null;
}
