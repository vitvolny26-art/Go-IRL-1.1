export type WebIdentityProvider = "google" | "facebook";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const readString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

export function readProviderSubject(identities: unknown, provider: WebIdentityProvider) {
  if (!Array.isArray(identities)) return null;
  for (const identity of identities) {
    const record = asRecord(identity);
    if (!record || record.provider !== provider) continue;
    const providerId = readString(record.provider_id);
    if (providerId) return providerId;
    const identityData = asRecord(record.identity_data);
    const subject = readString(identityData?.sub) || (provider === "facebook" ? readString(identityData?.id) : null);
    if (subject) return subject;
  }
  return null;
}
